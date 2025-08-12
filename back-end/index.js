import { exec } from "child_process";
import cors from "cors";
import voice from "elevenlabs-node";
import express from "express";
import { promises as fs } from "fs";
import OpenAI from "openai";
import dotenv from "dotenv";
// Load environment variables from a .env file into process.env
dotenv.config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const elevenLabsApiKey = process.env.ELEVENLABS_API_KEY;
const voiceID = "9BWtsMINqrJLrRacOk9x";

const app = express();
app.use(express.json());
app.use(cors());
const port = 3000;

// Utility functions
const execCommand = (command) => {
  return new Promise((resolve, reject) => {
    exec(command, (error, stdout, stderr) => {
      if (error) reject(error);
      resolve(stdout);
    });
  });
};

const lipSyncMessage = async (index) => {
  const time = new Date().getTime();
  console.log(`Starting conversion for message ${index}`);
  await execCommand(
    `ffmpeg -y -i audios/message_${index}.mp3 audios/message_${index}.wav`
  );
  console.log(`Conversion done in ${new Date().getTime() - time}ms`);
  await execCommand(
    `./bin/rhubarb -f json -o audios/message_${index}.json audios/message_${index}.wav -r phonetic`
  );
  console.log(`Lip sync done in ${new Date().getTime() - time}ms`);
};

const readJsonTranscript = async (file) => {
  const data = await fs.readFile(file, "utf8");
  return JSON.parse(data);
};

const audioFileToBase64 = async (file) => {
  const data = await fs.readFile(file);
  return data.toString("base64");
};

// Routes
app.get("/", (req, res) => {
  res.send("Hello World!");
});

app.get("/voices", async (req, res) => {
  if (!elevenLabsApiKey) {
    res.status(400).send("ElevenLabs API key is missing.");
    return;
  }
  try {
    res.send(await voice.getVoices(elevenLabsApiKey));
  } catch (error) {
    console.error(error);
    res.status(500).send("Failed to fetch voices.");
  }
});

app.post("/chat", async (req, res) => {
  const userMessage = req.body.message;

  // Check API keys
  if (!elevenLabsApiKey || !openai.apiKey) {
    res.send({
      messages: [
        {
          text: "Please my dear, don't forget to add your API keys!",
          audio: await audioFileToBase64("audios/api_0.wav"),
          lipsync: await readJsonTranscript("audios/api_0.json"),
          facialExpression: "angry",
          animation: "Angry",
        },
        {
          text: "You don't want to ruin Wawa Sensei with a crazy ChatGPT and ElevenLabs bill, right?",
          audio: await audioFileToBase64("audios/api_1.wav"),
          lipsync: await readJsonTranscript("audios/api_1.json"),
          facialExpression: "smile",
          animation: "Laughing",
        },
      ],
    });
    return;
  }

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo-1106",
      max_tokens: 1000,
      temperature: 0.6,
      messages: [
        {
          role: "system",
          content: `
            You are a virtual girlfriend.
            You will always reply with a JSON array of messages. With a maximum of 3 messages.
            Each message has a text, facialExpression, and animation property.
            The different facial expressions are: smile, sad, angry, surprised, funnyFace, and default.
            The different animations are: Talking_0, Talking_1, Talking_2, Crying, Laughing, Rumba, Idle, Terrified, and Angry. 
          `,
        },
        {
          role: "user",
          content: userMessage || "Hello",
        },
      ],
    });

    let messages = JSON.parse(completion.choices[0].message.content);
    if (messages.messages) {
      messages = messages.messages; // Handle different structures
    }

    for (let i = 0; i < messages.length; i++) {
      const message = messages[i];
      // Generate audio file
      const fileName = `audios/message_${i}.mp3`;
      const textInput = message.text;
      await voice.textToSpeech(elevenLabsApiKey, voiceID, fileName, textInput);

      // Generate lipsync
      await lipSyncMessage(i);
      message.audio = await audioFileToBase64(fileName);
      message.lipsync = await readJsonTranscript(`audios/message_${i}.json`);
    }

    res.send({ messages });
  } catch (error) {
    console.error(error);
    res.status(500).send("An error occurred while processing your request.");
  }
});

app.listen(port, () => {
  console.log(`Virtual Girlfriend listening on port ${port}`);
});
