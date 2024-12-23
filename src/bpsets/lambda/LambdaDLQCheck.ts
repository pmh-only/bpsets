import { LambdaClient, ListFunctionsCommand, UpdateFunctionConfigurationCommand } from '@aws-sdk/client-lambda'
import { BPSet } from '../BPSet'
import { Memorizer } from '../../Memorizer'

export class LambdaDLQCheck implements BPSet {
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
    const functions = await this.getFunctions()

    for (const func of functions) {
      if (func.DeadLetterConfig) {
        compliantResources.push(func.FunctionArn!)
      } else {
        nonCompliantResources.push(func.FunctionArn!)
      }
    }

    return {
      compliantResources,
      nonCompliantResources,
      requiredParametersForFix: [{ name: 'dlq-arn' }]
    }
  }

  public readonly fix = async (
    nonCompliantResources: string[],
    requiredParametersForFix: { name: string; value: string }[]
  ): Promise<void> => {
    const dlqArn = requiredParametersForFix.find(param => param.name === 'dlq-arn')?.value

    if (!dlqArn) {
      throw new Error("Required parameter 'dlq-arn' is missing.")
    }

    for (const functionArn of nonCompliantResources) {
      const functionName = functionArn.split(':').pop()!
      await this.client.send(
        new UpdateFunctionConfigurationCommand({
          FunctionName: functionName,
          DeadLetterConfig: { TargetArn: dlqArn }
        })
      )
    }
  }
}
