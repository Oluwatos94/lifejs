import type { GetTokenFunction } from "@/transport/auth";
import { AccessToken } from "livekit-server-sdk";

export const getToken: GetTokenFunction = async (roomName, participantId) => {
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;

  if (!apiKey || !apiSecret) {
    throw new Error("LiveKit API key or secret not provided");
  }

  // Create a token with the room name and participant name
  const token = new AccessToken(apiKey, apiSecret, {
    identity: participantId,
  });

  token.addGrant({
    roomJoin: true,
    room: roomName,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
    roomCreate: true,
  });

  return await token.toJwt();
};
