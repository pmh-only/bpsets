import {
  LambdaClient,
  ListFunctionsCommand,
  UpdateFunctionConfigurationCommand
} from '@aws-sdk/client-lambda'
import { BPSet } from '../../types'
import { Memorizer } from '../../Memorizer'

export class LambdaInsideVPC implements BPSet {
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
      if (func.VpcConfig && Object.keys(func.VpcConfig).length > 0) {
        compliantResources.push(func.FunctionArn!)
      } else {
        nonCompliantResources.push(func.FunctionArn!)
      }
    }

    return {
      compliantResources,
      nonCompliantResources,
      requiredParametersForFix: [
        { name: 'subnet-ids' },
        { name: 'security-group-ids' }
      ]
    }
  }

  public readonly fix = async (
    nonCompliantResources: string[],
    requiredParametersForFix: { name: string; value: string }[]
  ): Promise<void> => {
    const subnetIds = requiredParametersForFix.find(param => param.name === 'subnet-ids')?.value
    const securityGroupIds = requiredParametersForFix.find(param => param.name === 'security-group-ids')?.value

    if (!subnetIds || !securityGroupIds) {
      throw new Error("Required parameters 'subnet-ids' and/or 'security-group-ids' are missing.")
    }

    for (const functionArn of nonCompliantResources) {
      const functionName = functionArn.split(':').pop()!
      await this.client.send(
        new UpdateFunctionConfigurationCommand({
          FunctionName: functionName,
          VpcConfig: {
            SubnetIds: subnetIds.split(','),
            SecurityGroupIds: securityGroupIds.split(',')
          }
        })
      )
    }
  }
}
