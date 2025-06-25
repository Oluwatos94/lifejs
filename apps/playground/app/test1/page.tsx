"use client";
// import { AgentClient } from "life/client";
import { useState } from "react";

export default function Home() {
  const [token, setToken] = useState<string | null>(null);

  const startDiscussion = async () => {
    // const token = await fetchToken();
    // setToken(token);
    // const client = new AgentClient();
    // await client.inviteAgent("room-1", token);
  };

  return (
    <main>
      <p>Current token: {token}</p>
      <button
        type="button"
        onClick={() => startDiscussion()}
        className="rounded-md bg-green-500 p-2 text-white"
      >
        Start Discussion
      </button>
    </main>
  );
}
