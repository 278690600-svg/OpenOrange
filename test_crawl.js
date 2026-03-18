const fetch = require('node-fetch');

async function testCrawl() {
  const url = 'http://localhost:3000/api/chat';
  const body = {
    messages: [{ role: 'user', content: 'Summarize the DeepSeek-V3 technical whitepaper.' }],
    model: 'ollama::llama3', // Use a valid model ID
    webSearch: true,
    chatId: 'test-chat'
  };

  console.log('Testing Chat API with Web Crawling...');
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      console.error('API responded with error:', res.status, await res.text());
      return;
    }

    console.log('Headers:', res.headers.raw());
    
    // Read the stream
    const reader = res.body;
    reader.on('data', (chunk) => {
      // console.log('Received chunk:', chunk.toString());
    });

    reader.on('end', () => {
      console.log('Stream finished.');
    });

  } catch (e) {
    console.error('Fetch failed:', e.message);
  }
}

testCrawl();
