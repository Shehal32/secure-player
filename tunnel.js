const ngrok = require("@ngrok/ngrok");

// Ensure environment variable is populated
process.env.NGROK_AUTHTOKEN =
  process.env.NGROK_AUTHTOKEN ||
  "2sIsnDJ950S9HcQZPESY6l5l94o_4JP52mVo6A8Nm8JVBgnsF";

async function forwardToApp() {
  console.log("Starting ngrok tunnel for localhost:3000...");
  const forwarder = await ngrok.forward({
    addr: "localhost:3000",
    authtoken_from_env: true,
    domain: "unlikeable-unhectically-jasiah.ngrok-free.dev",
  });
  console.log(`Available at: ${forwarder.url()}`);
}

forwardToApp();
