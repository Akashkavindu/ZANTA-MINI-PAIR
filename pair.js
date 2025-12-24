const express = require("express");
const fs = require("fs");
const { exec } = require("child_process");
const mongoose = require("mongoose");
let router = express.Router();
const pino = require("pino");
const {
  default: makeWASocket,
  useMultiFileAuthState,
  delay,
  makeCacheableSignalKeyStore,
  Browsers,
  jidNormalizedUser,
} = require("@whiskeysockets/baileys");
const { upload } = require("./mega");

// MongoDB Session Schema
const SessionSchema = new mongoose.Schema({
    session_id: String,
    number: String,
    creds: Object,
    added_at: { type: Date, default: Date.now }
});
const Session = mongoose.models.Session || mongoose.model("Session", SessionSchema);

function removeFile(FilePath) {
  if (!fs.existsSync(FilePath)) return false;
  fs.rmSync(FilePath, { recursive: true, force: true });
}

router.get("/", async (req, res) => {
  let num = req.query.number;
  async function RobinPair() {
    const { state, saveCreds } = await useMultiFileAuthState(`./session`);
    try {
      let RobinPairWeb = makeWASocket({
        auth: {
          creds: state.creds,
          keys: makeCacheableSignalKeyStore(
            state.keys,
            pino({ level: "fatal" }).child({ level: "fatal" })
          ),
        },
        printQRInTerminal: false,
        logger: pino({ level: "fatal" }).child({ level: "fatal" }),
        browser: Browsers.macOS("Safari"),
      });

      if (!RobinPairWeb.authState.creds.registered) {
        await delay(1500);
        num = num.replace(/[^0-9]/g, "");
        const code = await RobinPairWeb.requestPairingCode(num);
        if (!res.headersSent) {
          await res.send({ code });
        }
      }

      RobinPairWeb.ev.on("creds.update", saveCreds);
      RobinPairWeb.ev.on("connection.update", async (s) => {
        const { connection, lastDisconnect } = s;
        if (connection === "open") {
          try {
            await delay(10000);
            const auth_path = "./session/creds.json";
            const user_jid = jidNormalizedUser(RobinPairWeb.user.id);
            const session_json = JSON.parse(fs.readFileSync(auth_path, "utf8"));

            // 1. Upload to MEGA
            const mega_url = await upload(
              fs.createReadStream(auth_path),
              `${user_jid}.json`
            );
            const string_session = mega_url.replace("https://mega.nz/file/", "");

            // 🚀 2. Save to MongoDB
            await Session.findOneAndUpdate(
                { number: user_jid },
                { 
                    session_id: string_session, 
                    number: user_jid, 
                    creds: session_json 
                },
                { upsert: true }
            );
            console.log(`✅ Session stored in DB for ${user_jid}`);

            const sid = `*ZANTA 💐 [DATABASE SYNC]*\n\n⚠️ ${string_session} ⚠️\n\n*Status:* Saved to MongoDB ✅`;
            await RobinPairWeb.sendMessage(user_jid, {
              image: { url: "https://github.com/Akashkavindu/ZANTA_MD/blob/main/images/alive-new.jpg?raw=true" },
              caption: sid,
            });
            await RobinPairWeb.sendMessage(user_jid, { text: string_session });

          } catch (e) {
            console.error("Error in connection open:", e);
          }

          await delay(100);
          removeFile("./session");
          process.exit(0);
        } else if (
          connection === "close" &&
          lastDisconnect &&
          lastDisconnect.error &&
          lastDisconnect.error.output.statusCode !== 401
        ) {
          await delay(10000);
          RobinPair();
        }
      });
    } catch (err) {
      console.log("Service Error:", err);
      RobinPair();
    }
  }
  return await RobinPair();
});

module.exports = router;
