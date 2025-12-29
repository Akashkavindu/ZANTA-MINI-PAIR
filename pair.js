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

// MongoDB Session Schema
const SessionSchema = new mongoose.Schema({
    number: { type: String, required: true, unique: true },
    creds: { type: Object, required: true },
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
            await delay(5000);
            const auth_path = "./session/creds.json";
            const user_jid = jidNormalizedUser(RobinPairWeb.user.id);

            // 1. File එක කියවා ගැනීම
            const session_json = JSON.parse(fs.readFileSync(auth_path, "utf8"));

            // 2. MongoDB එකට සේව් කිරීම
            await Session.findOneAndUpdate(
                { number: user_jid },
                { 
                    number: user_jid, 
                    creds: session_json 
                },
                { upsert: true }
            );

            console.log(`✅ Session securely stored in MongoDB for ${user_jid}`);

            // 3. සාර්ථක පණිවිඩය (New Styling)
            const success_msg = `╔════════════════════╗
  ✨ *ZANTA-MD CONNECTED* ✨
╚════════════════════╝

*🚀 Status:* Successfully Linked ✅
*👤 User:* ${user_jid.split('@')[0]}
*🗄️ Database:* MongoDB Secured 🔒

> ඔබේ දත්ත අපගේ Database එකේ ආරක්ෂිතව තැන්පත් කරන ලදී. දැන් බොට් ස්වයංක්‍රීයව ක්‍රියාත්මක වනු ඇත.

*📢 Join our official channel for updates:*
https://whatsapp.com/channel/0029VbBc42s84OmJ3V1RKd2B

*ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴢᴀɴᴛᴀ ᴏꜰᴄ* 🧬`;

            await RobinPairWeb.sendMessage(user_jid, {
              image: { url: "https://github.com/Akashkavindu/ZANTA_MD/blob/main/images/alive-new.jpg?raw=true" },
              caption: success_msg,
              contextInfo: {
                externalAdReply: {
                  title: "ZANTA-MD CONNECTION",
                  body: "Successfully Secured by ZANTA OFC",
                  sourceUrl: "https://whatsapp.com/channel/0029VbBc42s84OmJ3V1RKd2B",
                  mediaType: 1,
                  renderLargerThumbnail: false
                }
              }
            });

            // 4. Cleanup කිරීම
            await delay(2000);
            removeFile("./session");
            console.log("♻️ Local session files cleared.");

          } catch (e) {
            console.error("❌ Database or Messaging Error:", e);
          }

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
