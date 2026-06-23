import Constants from 'expo-constants';

const RETELL_API_KEY =
  (Constants.expoConfig?.extra?.retellApiKey as string) ||
  'key_c833df9a891bacfc002cf8714c0c';

const RETELL_AGENT_ID =
  (Constants.expoConfig?.extra?.retellAgentId as string) ||
  'PLACEHOLDER_SET_THIS';

export interface RetellWebCallResponse {
  call_id: string;
  web_call_link: string;
  access_token: string;
}

export async function createRetellWebCall(): Promise<RetellWebCallResponse> {
  const response = await fetch('https://api.retellai.com/v2/create-web-call', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RETELL_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      agent_id: RETELL_AGENT_ID,
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(
      `Failed to create Retell call: ${response.status} ${JSON.stringify(error)}`
    );
  }

  return response.json();
}
