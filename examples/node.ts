import { Governor } from '../src/index.js';

async function main() {
  const governor = await Governor.create({
    apiKey: process.env.AISENTINEL_API_KEY,
    endpoint: process.env.AISENTINEL_ENDPOINT ?? 'https://api.aisentinel.ai/v1'
  });

  const result = await governor.evaluate({
    policyId: 'default-policy',
    input: {
      prompt: 'Generate a secure summary of customer data.'
    },
    context: {
      userId: 'example-user'
    }
  });

  console.log('Evaluation Result', result);

  await governor.close();
}

void main().catch((error) => {
  console.error('Governor example failed', error);
  process.exitCode = 1;
});
