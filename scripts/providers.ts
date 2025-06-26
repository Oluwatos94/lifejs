interface Provider {
  type: "LLM" | "TTS" | "STT";
  name: string;
  usefulLinks: string[];
}

const providers: Provider[] = [
  {
    type: "LLM",
    name: "OpenAI",
    usefulLinks: ["https://openai.com/api/pricing/", "https://openai.com/api/pricing/"],
  },
];
