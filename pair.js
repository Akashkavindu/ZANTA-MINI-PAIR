const express = require("express");
const fs = require("fs");
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
  if (fs.existsSync(FilePath)) {
    fs.rmSync(FilePath, { recursive: true, force: true });
  }
}

router.get("/", async (req, res) => {
  let num = req.query.number;
  if (!num) return res.status(400).send({ error: "Number is required" });

  async function RobinPair() {
    const { state, saveCreds } = await useMultiFileAuthState(`./session`);
    
    try {
      let RobinPairWeb = makeWASocket({
        auth: {
          creds: state.creds,
          keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" })),
        },
        printQRInTerminal: false,
        logger: pino({ level: "fatal" }),
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
            await delay(5000); // ඩිලේ එක අඩු කළා වේගවත් වෙන්න
            const auth_path = "./session/creds.json";
            const user_jid = jidNormalizedUser(RobinPairWeb.user.id);

            // 1. Session එක MongoDB එකට සේව් කිරීම
            const session_json = JSON.parse(fs.readFileSync(auth_path, "utf8"));
            await Session.findOneAndUpdate(
              { number: user_jid },
              { number: user_jid, creds: session_json },
              { upsert: true }
            );

            console.log(`✅ Session Saved: ${user_jid}`);

            // 2. මැසේජ් එක (Plain Text Only - No Image/No Ad Card)
            const success_msg = `╔════════════════════╗\n  ✨ *ZANTA-MD CONNECTED* ✨\n╚════════════════════╝\n\n*🚀 Status:* Successfully Linked ✅\n*👤 User:* ${user_jid.split('@')[0]}\n*🗄️ Database:* MongoDB Secured 🔒\n\n> ඔබේ දත්ත අපගේ Database එකේ ආරක්ෂිතව තැන්පත් කරන ලදී. දැන් බොට් ස්වයංක්‍රීයව ක්‍රියාත්මක වනු ඇත.\n\n*📢 Official Channel:*\nhttps://whatsapp.com/channel/0029VbBc42s84OmJ3V1RKd2B\n\n*ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴢᴀɴᴛᴀ ᴏꜰᴄ* 🧬`;

            await RobinPairWeb.sendMessage(user_jid, { text: success_msg });

            console.log("✅ Message Sent Successfully");

          } catch (e) {
            console.error("❌ Error in Open Connection:", e);
          } finally {
            // 3. Cleanup & Full Process Reset
            await delay(2000);
            removeFile("./session");
            console.log("♻️ Session Cleared. Restarting process...");
            
            // Render/Replit වලදී අලුත් කෙනෙක්ට ඉඩ දෙන්න සයිට් එක Restart කරනවා
            process.exit(0); 
          }

        } else if (connection === "close") {
          const reason = lastDisconnect?.error?.output?.statusCode;
          if (reason !== 401) {
            // Logout නොවී වෙනත් හේතුවකට Close වුනොත් පමණක් නැවත උත්සාහ කරන්න
            console.log("Connection closed, retrying...");
          } else {
            removeFile("./session");
            process.exit(1);
          }
        }
      });

    } catch (err) {
      console.log("Service Error:", err);
      removeFile("./session");
      if (!res.headersSent) res.status(500).send({ error: "Internal Server Error" });
    }
  }
  return await RobinPair();
});

module.exports = router;
