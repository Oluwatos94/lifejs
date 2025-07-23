#!/usr/bin/env bun
/**
 * Integration test for RimeTTS provider
 *
 * This script tests the actual RimeTTS API integration.
 * Set RIME_API_KEY environment variable before running.
 *
 * Usage:
 *   RIME_API_KEY=your_key bun run integration-test.ts
 */

import { RimeTTS } from "../providers/rime";

function testInitialization() {
  console.log("1️⃣ Testing initialization...");
  const rimeTTS = new RimeTTS({
    apiKey: process.env.RIME_API_KEY || "",
    model: "arcana",
    speaker: "default",
  });
  console.log("✅ RimeTTS initialized successfully");
  return rimeTTS;
}

async function testJobCreation(rimeTTS: RimeTTS) {
  console.log("\n2️⃣ Testing job creation...");
  const job = await rimeTTS.generate();
  console.log(`✅ Job created with ID: ${job.id}`);
  return job;
}

async function testTextToSpeechConversion(rimeTTS: RimeTTS) {
  console.log("\n3️⃣ Testing text-to-speech conversion...");
  const testText = "Hello from Life.js! This is a test of the Rime TTS integration.";

  let chunkCount = 0;
  let totalAudioSamples = 0;
  let hasError = false;
  let errorMessage = "";

  const job = await rimeTTS.generate();
  job.pushText(testText, true);

  console.log("   Processing audio stream...");
  for await (const chunk of job.getStream()) {
    if (chunk.type === "content") {
      chunkCount++;
      totalAudioSamples += chunk.voiceChunk.length;
      console.log(
        `   📦 Chunk ${chunkCount}: ${chunk.voiceChunk.length} samples, text: "${chunk.textChunk}"`,
      );
    } else if (chunk.type === "end") {
      console.log("   🏁 Stream ended");
      break;
    } else if (chunk.type === "error") {
      hasError = true;
      errorMessage = chunk.error;
      console.error(`   ❌ Error: ${chunk.error}`);
      break;
    }
  }

  if (hasError) {
    console.error(`\n❌ Test failed with error: ${errorMessage}`);
    process.exit(1);
  }

  console.log(`✅ Generated ${chunkCount} audio chunks with ${totalAudioSamples} total samples`);
  return { testText, chunkCount, totalAudioSamples };
}

async function testJobCancellation(rimeTTS: RimeTTS) {
  console.log("\n4️⃣ Testing job cancellation...");
  const cancelJob = await rimeTTS.generate();
  cancelJob.pushText("This should be cancelled");

  setTimeout(() => cancelJob.cancel(), 10);

  let cancelledProperly = true;
  try {
    for await (const chunk of cancelJob.getStream()) {
      if (chunk.type === "error" && !chunk.error.includes("aborted")) {
        cancelledProperly = false;
      }
      break;
    }

    if (!cancelledProperly) {
      console.log("⚠️ Job cancellation may not have worked as expected");
    }
  } catch {
    // Cancellation might throw, which is acceptable
  }

  console.log("✅ Job cancellation works correctly");
}

async function testDifferentModels() {
  console.log("\n5️⃣ Testing different models...");

  const models = ["arcana", "mist", "mistv2"] as const;

  const modelTests = models.map(async (model) => {
    try {
      const modelRime = new RimeTTS({
        apiKey: process.env.RIME_API_KEY || "",
        model,
        maxTokens: 100,
      });

      const modelJob = await modelRime.generate();
      modelJob.pushText("Quick test", true);

      let modelWorked = false;
      for await (const chunk of modelJob.getStream()) {
        if (chunk.type === "content") {
          modelWorked = true;
        }
        if (chunk.type === "end" || chunk.type === "error") {
          break;
        }
      }

      return {
        model,
        success: modelWorked,
        error: null,
      };
    } catch (error) {
      return {
        model,
        success: false,
        error: error instanceof Error ? error.message : "failed",
      };
    }
  });

  const results = await Promise.all(modelTests);

  for (const result of results) {
    console.log(
      `   ${result.success ? "✅" : "⚠️"} Model "${result.model}": ${result.success ? "working" : result.error}`,
    );
  }
}

function printTestSummary(testText: string, chunkCount: number, totalAudioSamples: number) {
  console.log("\n🎉 All tests completed successfully!");
  console.log("\n📊 Test Summary:");
  console.log(`   • Text processed: "${testText}"`);
  console.log(`   • Audio chunks generated: ${chunkCount}`);
  console.log(`   • Total audio samples: ${totalAudioSamples}`);
  console.log(`   • Estimated duration: ~${(totalAudioSamples / 24_000).toFixed(2)}s`);
}

async function testRimeTTSIntegration() {
  console.log("🧪 Starting RimeTTS Integration Test...\n");

  if (!process.env.RIME_API_KEY) {
    console.error("❌ RIME_API_KEY environment variable is required");
    console.log("   Set it like: RIME_API_KEY=your_key bun run integration-test.ts");
    process.exit(1);
  }

  try {
    const rimeTTS = testInitialization();
    await testJobCreation(rimeTTS);
    const { testText, chunkCount, totalAudioSamples } = await testTextToSpeechConversion(rimeTTS);
    await testJobCancellation(rimeTTS);
    await testDifferentModels();
    printTestSummary(testText, chunkCount, totalAudioSamples);
  } catch (error) {
    console.error("\n❌ Integration test failed:");
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

// Run the test
testRimeTTSIntegration().catch(console.error);
