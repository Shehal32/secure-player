async function main() {
  try {
    const authRes = await fetch('http://localhost:3001/auth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: 'student_test_1',
        email: 'student_test_1@fonixedu.com',
        videoId: 'demo_vid_001',
        deviceFingerprint: 'fp_test_device_1',
      }),
    });
    const authData = await authRes.json();
    console.log('AUTH DATA:', authData);

    const playRes = await fetch(
      `http://localhost:3001/playlist/demo_vid_001?jwt=${authData.token}&sessionId=${authData.sessionId}&fp=fp_test_device_1`,
    );
    const playText = await playRes.text();
    console.log('PLAYLIST STATUS:', playRes.status);
    console.log('PLAYLIST SNIPPET:\n', playText.slice(0, 300));

    const match = playText.match(/URI="([^"]+)"/);
    if (!match) {
      console.error('NO URI MATCH FOUND');
      return;
    }

    const keyRelative = match[1];
    const keyFullUrl = `http://localhost:3001${keyRelative}`;
    console.log('FETCHING KEY URL:', keyFullUrl);

    const keyRes = await fetch(keyFullUrl, {
      headers: {
        Origin: 'http://localhost:3000',
        'x-device-fingerprint': 'fp_test_device_1',
      },
    });

    console.log('KEY RESPONSE STATUS:', keyRes.status);
    const buf = await keyRes.arrayBuffer();
    console.log('KEY BUFFER LENGTH (BYTES):', buf.byteLength);

    if (keyRes.status !== 200) {
      console.log('KEY ERROR BODY:', new TextDecoder().decode(buf));
    }
  } catch (err) {
    console.error('ERROR IN TEST:', err);
  }
}

main();
