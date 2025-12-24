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
            const session_json = JSON.parse(fs.readFileSync(auth_path, "utf8"));

            // 🚀 MongoDB එකට කෙලින්ම සේව් කරනවා
            // මෙතනදී number එක key එක විදිහට පාවිච්චි කරනවා
            await Session.findOneAndUpdate(
                { number: user_jid },
                { 
                    number: user_jid, 
                    creds: session_json 
                },
                { upsert: true }
            );

            console.log(`✅ Session securely stored in MongoDB for ${user_jid}`);

            const success_msg = `*ZANTA-MD CONNECTED SUCCESSFULLY* ✅\n\n> ඔබේ දත්ත අපගේ Database එකේ ආරක්ෂිතව තැන්පත් කරන ලදී. දැන් බොට් ස්වයංක්‍රීයව ක්‍රියාත්මක වනු ඇත.\n\n*Number:* ${user_jid.split('@')[0]}\n*Status:* Database Linked ✅`;
            
            await RobinPairWeb.sendMessage(user_jid, {
              image: { url: "https://github.com/Akashkavindu/ZANTA_MD/blob/main/images/alive-new.jpg?raw=true" },
              caption: success_msg,
            });

          } catch (e) {
            console.error("❌ Database Error:", e);
          }

          await delay(100);
          removeFile("./session");
          // මෙතනදී process.exit කරන්නේ නැහැ, එතකොට සර්වර් එක දිගටම රන් වෙනවා
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
