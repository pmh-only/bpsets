import {
  LambdaClient,
  ListFunctionsCommand,
  GetPolicyCommand,
  RemovePermissionCommand
} from '@aws-sdk/client-lambda'
import { BPSet } from '../BPSet'
import { Memorizer } from '../../Memorizer'

export class LambdaFunctionPublicAccessProhibited implements BPSet {
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
      try {
        const response = await this.memoClient.send(new GetPolicyCommand({ FunctionName: func.FunctionName! }))
        const policy = JSON.parse(response.Policy!)

        const hasPublicAccess = policy.Statement.some(
          (statement: any) => statement.Principal === '*' || statement.Principal?.AWS === '*'
        )

        if (hasPublicAccess) {
          nonCompliantResources.push(func.FunctionArn!)
        } else {
          compliantResources.push(func.FunctionArn!)
        }
      } catch (error) {
        if ((error as any).name === 'ResourceNotFoundException') {
          nonCompliantResources.push(func.FunctionArn!)
        } else {
          throw error
        }
      }
    }

    return {
      compliantResources,
      nonCompliantResources,
      requiredParametersForFix: []
    }
  }

  public readonly fix = async (
    nonCompliantResources: string[],
    requiredParametersForFix: { name: string; value: string }[]
  ): Promise<void> => {
    for (const functionArn of nonCompliantResources) {
      const functionName = functionArn.split(':').pop()!

      try {
        const response = await this.memoClient.send(new GetPolicyCommand({ FunctionName: functionName }))
        const policy = JSON.parse(response.Policy!)

        for (const statement of policy.Statement) {
          if (statement.Principal === '*' || statement.Principal?.AWS === '*') {
            await this.client.send(
              new RemovePermissionCommand({
                FunctionName: functionName,
                StatementId: statement.Sid // Use the actual StatementId from the policy
              })
            )
          }
        }
      } catch (error) {
        if ((error as any).name !== 'ResourceNotFoundException') {
          throw error
        }
      }
    }
  }
}
