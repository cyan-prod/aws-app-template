const jwt = require('jsonwebtoken');
const fs = require('fs');
const https = require('https');

const APP_ID = '2180081';
const PRIVATE_KEY_PATH = '/Users/cyan/Downloads/cyan-prod/token/cyan-magic.2025-10-25.private-key.pem';

// Read private key
const privateKey = fs.readFileSync(PRIVATE_KEY_PATH, 'utf8');

// Generate JWT
const now = Math.floor(Date.now() / 1000);
const payload = {
  iat: now - 60,
  exp: now + 600,
  iss: APP_ID
};

const jwtToken = jwt.sign(payload, privateKey, { algorithm: 'RS256' });
console.log('✅ JWT Token generated successfully');

// Function to make HTTPS requests
function makeRequest(options, postData = null) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          const jsonData = JSON.parse(data);
          resolve({ statusCode: res.statusCode, data: jsonData });
        } catch (e) {
          resolve({ statusCode: res.statusCode, data: data });
        }
      });
    });

    req.on('error', (e) => {
      reject(e);
    });

    if (postData) {
      req.write(postData);
    }
    req.end();
  });
}

async function testGitHubApp() {
  try {
    // Step 1: Get installations
    console.log('\n🔍 Getting GitHub App installations...');
    const installationsResponse = await makeRequest({
      hostname: 'api.github.com',
      path: '/app/installations',
      method: 'GET',
      headers: {
        'Authorization': 'Bearer ' + jwtToken,
        'Accept': 'application/vnd.github+json',
        'User-Agent': 'cyan-magic-test'
      }
    });

    if (installationsResponse.statusCode !== 200) {
      console.log('❌ Failed to get installations:', installationsResponse.statusCode, installationsResponse.data);
      return;
    }

    const installations = installationsResponse.data;
    console.log(`✅ Found ${installations.length} installations`);

    if (installations.length === 0) {
      console.log('❌ No installations found. App needs to be installed in the organization.');
      return;
    }

    const installation = installations[0];
    console.log(`✅ Installation ID: ${installation.id}, Account: ${installation.account.login}`);

    // Step 2: Generate installation token
    console.log('\n🔑 Generating installation access token...');
    const tokenResponse = await makeRequest({
      hostname: 'api.github.com',
      path: `/app/installations/${installation.id}/access_tokens`,
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + jwtToken,
        'Accept': 'application/vnd.github+json',
        'User-Agent': 'cyan-magic-test'
      }
    });

    if (tokenResponse.statusCode !== 201) {
      console.log('❌ Failed to generate installation token:', tokenResponse.statusCode, tokenResponse.data);
      return;
    }

    const accessToken = tokenResponse.data.token;
    console.log('✅ Installation token generated successfully');

    // Step 3: Test API call to the forked repo
    console.log('\n📁 Testing access to forked repository...');
    const repoResponse = await makeRequest({
      hostname: 'api.github.com',
      path: '/repos/cyan-prod/aws-app-test',
      method: 'GET',
      headers: {
        'Authorization': 'token ' + accessToken,
        'Accept': 'application/vnd.github+json',
        'User-Agent': 'cyan-magic-test'
      }
    });

    if (repoResponse.statusCode === 200) {
      console.log('✅ Successfully accessed repository:', repoResponse.data.full_name);
      console.log('   Description:', repoResponse.data.description);
      console.log('   Private:', repoResponse.data.private);
    } else {
      console.log('❌ Failed to access repository:', repoResponse.statusCode, repoResponse.data);
    }

    // Step 4: Test creating a ruleset
    console.log('\n🔒 Testing ruleset creation...');
    const rulesetData = {
      name: 'test-ruleset',
      target: 'branch',
      enforcement: 'active',
      conditions: {
        ref_name: {
          include: ['refs/heads/main']
        }
      },
      rules: [
        {
          type: 'required_status_checks',
          parameters: {
            required_status_checks: {
              strict: true,
              contexts: ['test-check']
            }
          }
        }
      ]
    };

    const rulesetResponse = await makeRequest({
      hostname: 'api.github.com',
      path: '/repos/cyan-prod/aws-app-test/rulesets',
      method: 'POST',
      headers: {
        'Authorization': 'token ' + accessToken,
        'Accept': 'application/vnd.github+json',
        'User-Agent': 'cyan-magic-test',
        'Content-Type': 'application/json'
      }
    }, JSON.stringify(rulesetData));

    if (rulesetResponse.statusCode === 201) {
      console.log('✅ Successfully created test ruleset:', rulesetResponse.data.id);

      // Clean up - delete the test ruleset
      console.log('🧹 Cleaning up test ruleset...');
      const deleteResponse = await makeRequest({
        hostname: 'api.github.com',
        path: `/repos/cyan-prod/aws-app-test/rulesets/${rulesetResponse.data.id}`,
        method: 'DELETE',
        headers: {
          'Authorization': 'token ' + accessToken,
          'Accept': 'application/vnd.github+json',
          'User-Agent': 'cyan-magic-test'
        }
      });

      if (deleteResponse.statusCode === 204) {
        console.log('✅ Test ruleset deleted successfully');
      } else {
        console.log('⚠️ Failed to delete test ruleset:', deleteResponse.statusCode);
      }
    } else {
      console.log('❌ Failed to create ruleset:', rulesetResponse.statusCode, rulesetResponse.data);
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

testGitHubApp();
