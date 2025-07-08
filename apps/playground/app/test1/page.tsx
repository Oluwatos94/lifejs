"use client";
import { AgentClient } from "life/client";
import { useState } from "react";
import { fetchToken } from "./actions";
import { FancyButton } from "@/components/ui/fancy-button";

const client = new AgentClient({});

export default function Home() {
  const [token, setToken] = useState<string | null>(null);
  

  const startDiscussion = async () => {
    const token = await fetchToken();
    setToken(token);
    await client.inviteAgent("room-1", token);
  };

  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-gray-50 p-8 relative">
      <div className="text-center space-y-8">
        <img 
          src="/logo-full.png" 
          alt="Life.js"
          className="h-6 mx-auto mb-12 opacity-70"
        />
        
        <FancyButton onClick={() => startDiscussion()} size="md" className="text-white">
          Start Discussion
        </FancyButton>
        
        <div className="grid grid-cols-2 gap-8 w-fit mx-auto">
          <div
            className="w-32 h-32 bg-red-500 rounded-xl cursor-pointer transition-transform hover:scale-105 shadow-lg"
            onMouseEnter={() => client.say("You're on the red square")}
          />
          <div
            className="w-32 h-32 bg-blue-500 rounded-xl cursor-pointer transition-transform hover:scale-105 shadow-lg"
            onMouseEnter={() => client.say("You're on the blue square")}
          />
          <div
            className="w-32 h-32 bg-green-500 rounded-xl cursor-pointer transition-transform hover:scale-105 shadow-lg"
            onMouseEnter={() => client.say("You're on the green square")}
          />
          <div
            className="w-32 h-32 bg-yellow-500 rounded-xl cursor-pointer transition-transform hover:scale-105 shadow-lg"
            onMouseEnter={() => client.say("You're on the yellow square")}
          />
        </div>
      </div>
      
      <div className="absolute bottom-4 left-4 right-4 text-center flex items-center justify-center">
        <p className="text-xs text-gray-400 break-all text-pretty max-w-[710px]">
          Token: {token}
        </p>
      </div>
    </main>
  );
}
