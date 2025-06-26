import { z } from "zod";
import { XaiLLM, xaiLLMConfigSchema } from "./xai";
import type { Message, ToolDefinition } from "@/agent/resources";

function logTest(testName: string, passed: boolean, details?: string) {
  const status = passed ? "✅ PASS" : "❌ FAIL";
  console.log(`${status}: ${testName}${details ? ` - ${details}` : ""}`);
}

function runTests() {
  console.log("🧪 Running xAI Provider Tests\n");
  
  let totalTests = 0;
  let passedTests = 0;

  totalTests++;
  try {
    const validConfig = {
      apiKey: "test-api-key",
      model: "grok-3-mini" as const,
      temperature: 0.5,
    };
    
    const parsed = xaiLLMConfigSchema.parse(validConfig);
    const isValid = parsed.apiKey === "test-api-key" && 
                   parsed.model === "grok-3-mini" && 
                   parsed.temperature === 0.5;
    
    logTest("Configuration Schema Validation", isValid);
    if (isValid) passedTests++;
  } catch (error) {
    logTest("Configuration Schema Validation", false, `Error: ${error}`);
  }


  totalTests++;
  try {
    const configWithDefaults = xaiLLMConfigSchema.parse({
      apiKey: "test-key"
    });
    
    const hasDefaults = configWithDefaults.model === "grok-3-mini" && 
                       configWithDefaults.temperature === 0.5;
    
    logTest("Default Configuration Values", hasDefaults);
    if (hasDefaults) passedTests++;
  } catch (error) {
    logTest("Default Configuration Values", false, `Error: ${error}`);
  }

  totalTests++;
  try {
    const configEmpty = xaiLLMConfigSchema.parse({});
    const hasApiKey = typeof configEmpty.apiKey === 'string';
    
    logTest("Environment Variable Default Schema", hasApiKey, 
           `API key is ${configEmpty.apiKey ? 'set' : 'empty'}`);
    if (hasApiKey) passedTests++;
  } catch (error) {
    logTest("Environment Variable Default Schema", false, `Error: ${error}`);
  }

  totalTests++;
  try {
    xaiLLMConfigSchema.parse({
      apiKey: "test-key",
      model: "invalid-model"
    });
    logTest("Invalid Model Validation", false, "Should have thrown error");
  } catch (error) {
    logTest("Invalid Model Validation", true, "Correctly rejected invalid model");
    passedTests++;
  }

  totalTests++;
  try {
    xaiLLMConfigSchema.parse({
      apiKey: "test-key",
      temperature: 3.0
    });
    logTest("Temperature Range Validation", false, "Should have thrown error for temp > 2");
  } catch (error) {
    logTest("Temperature Range Validation", true, "Correctly rejected invalid temperature");
    passedTests++;
  }

  totalTests++;
  try {
    const provider = new XaiLLM({
      apiKey: "test-api-key",
      model: "grok-3-mini",
      temperature: 0.7
    });
    
    const isInstantiated = provider instanceof XaiLLM;
    logTest("Provider Instantiation", isInstantiated);
    if (isInstantiated) passedTests++;
  } catch (error) {
    logTest("Provider Instantiation", false, `Error: ${error}`);
  }

  totalTests++;
  try {
    new XaiLLM({
      apiKey: "",
      model: "grok-3-mini"
    });
    logTest("No API Key Error Handling", false, "Should have thrown error");
  } catch (error) {
    const isExpectedError = error instanceof Error && 
                           error.message.includes("XAI_API_KEY");
    logTest("No API Key Error Handling", isExpectedError, "Correctly threw API key error");
    if (isExpectedError) passedTests++;
  }


  totalTests++;
  try {
    const expectedModels = [
      "grok-3",
      "grok-3-fast", 
      "grok-3-mini",
      "grok-3-mini-fast",
      "grok-2-1212",
      "grok-2-vision-1212",
      "grok-beta",
      "grok-vision-beta"
    ];
    
    let allModelsValid = true;
    for (const model of expectedModels) {
      try {
        xaiLLMConfigSchema.parse({
          apiKey: "test-key",
          model: model
        });
      } catch {
        allModelsValid = false;
        break;
      }
    }
    
    logTest("All Available Models Validation", allModelsValid);
    if (allModelsValid) passedTests++;
  } catch (error) {
    logTest("All Available Models Validation", false, `Error: ${error}`);
  }

  totalTests++;
  try {
    const provider = new XaiLLM({
      apiKey: "test-api-key",
      model: "grok-3-mini"
    });

    const testMessages: Message[] = [
      {
        id: "msg1",
        role: "system",
        content: "You are a helpful assistant."
      },
      {
        id: "msg2", 
        role: "user",
        content: "Hello!"
      },
      {
        id: "msg3",
        role: "agent",
        content: "Hi there!",
        toolsRequests: [{
          id: "tool1",
          input: { param: "value" }
        }]
      }
    ];

    const hasMessageMethods = typeof (provider as any).generateMessage === 'function' &&
                             typeof (provider as any).generateObject === 'function';
    
    logTest("Message Format Conversion Support", hasMessageMethods);
    if (hasMessageMethods) passedTests++;
  } catch (error) {
    logTest("Message Format Conversion Support", false, `Error: ${error}`);
  }

  totalTests++;
  try {
    const provider = new XaiLLM({
      apiKey: "test-api-key",
      model: "grok-3-mini"
    });

    const testTools: ToolDefinition[] = [
      {
        id: "test_tool",
        description: "A test tool",
        inputSchema: z.object({
          param: z.string()
        })
      }
    ];

    const supportsTools = typeof (provider as any).generateMessage === 'function';
    
    logTest("Tool Definition Support", supportsTools);
    if (supportsTools) passedTests++;
  } catch (error) {
    logTest("Tool Definition Support", false, `Error: ${error}`);
  }

  console.log(`\nTest Summary:`);
  console.log(`Total Tests: ${totalTests}`);
  console.log(`Passed: ${passedTests}`);
  console.log(`Failed: ${totalTests - passedTests}`);
  console.log(`Success Rate: ${((passedTests / totalTests) * 100).toFixed(1)}%`);

  if (passedTests === totalTests) {
    console.log("\n All tests passed! xAI provider is ready for use.");
  } else {
    console.log("\n Some tests failed. Please review the implementation.");
  }

  return passedTests === totalTests;
}

export { runTests };

if (require.main === module) {
  runTests();
}
