import { LambdaClient, ListFunctionsCommand, UpdateFunctionConfigurationCommand } from '@aws-sdk/client-lambda'
import { BPSet } from '../../types'
import { Memorizer } from '../../Memorizer'

export class LambdaFunctionSettingsCheck implements BPSet {
  private readonly client = new LambdaClient({})
  private readonly memoClient = Memorizer.memo(this.client)

  private readonly getFunctions = async () => {
    const response = await this.memoClient.send(new ListFunctionsCommand({}))
    return response.Functions || []
  }

  public readonly check = async (): Promise<{
    compliantResources: string[]
    nonCompliantResources: string[]
    requiredParametersForFix: { name: string }[]
  }> => {
    const compliantResources: string[] = []
    const nonCompliantResources: string[] = []
    const defaultTimeout = 3
    const defaultMemorySize = 128
    const functions = await this.getFunctions()

    for (const func of functions) {
      if (func.Timeout === defaultTimeout || func.MemorySize === defaultMemorySize) {
        nonCompliantResources.push(func.FunctionArn!)
      } else {
        compliantResources.push(func.FunctionArn!)
      }
    }

    return {
      compliantResources,
      nonCompliantResources,
      requiredParametersForFix: [
        { name: 'timeout' },
        { name: 'memory-size' }
      ]
    }
  }

  public readonly fix = async (
    nonCompliantResources: string[],
    requiredParametersForFix: { name: string; value: string }[]
  ): Promise<void> => {
    const timeout = requiredParametersForFix.find(param => param.name === 'timeout')?.value
    const memorySize = requiredParametersForFix.find(param => param.name === 'memory-size')?.value

    if (!timeout || !memorySize) {
      throw new Error("Required parameters 'timeout' and/or 'memory-size' are missing.")
    }

    for (const functionArn of nonCompliantResources) {
      const functionName = functionArn.split(':').pop()!
      await this.client.send(
        new UpdateFunctionConfigurationCommand({
          FunctionName: functionName,
          Timeout: parseInt(timeout, 10),
          MemorySize: parseInt(memorySize, 10)
        })
      )
    }
  }
}
