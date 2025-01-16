import { LambdaClient, ListFunctionsCommand, GetPolicyCommand, RemovePermissionCommand } from '@aws-sdk/client-lambda'
import { BPSet, BPSetMetadata, BPSetStats } from '../../types'
import { Memorizer } from '../../Memorizer'

export class LambdaFunctionPublicAccessProhibited implements BPSet {
  private readonly client = new LambdaClient({})
  private readonly memoClient = Memorizer.memo(this.client)

  private readonly stats: BPSetStats = {
    compliantResources: [],
    nonCompliantResources: [],
    status: 'LOADED',
    errorMessage: []
  }

  public readonly getMetadata = (): BPSetMetadata => ({
    name: 'LambdaFunctionPublicAccessProhibited',
    description: 'Ensures that Lambda functions do not allow public access via their resource-based policies.',
    priority: 1,
    priorityReason: 'Publicly accessible Lambda functions pose significant security risks.',
    awsService: 'Lambda',
    awsServiceCategory: 'Serverless',
    bestPracticeCategory: 'Security',
    requiredParametersForFix: [],
    isFixFunctionUsesDestructiveCommand: true,
    commandUsedInCheckFunction: [
      {
        name: 'ListFunctionsCommand',
        reason: 'Retrieve all Lambda functions in the account.'
      },
      {
        name: 'GetPolicyCommand',
        reason: 'Fetch the resource-based policy of a Lambda function.'
      }
    ],
    commandUsedInFixFunction: [
      {
        name: 'RemovePermissionCommand',
        reason: 'Remove public access permissions from a Lambda function.'
      }
    ],
    adviseBeforeFixFunction: 'Ensure that removing permissions does not disrupt legitimate use of the Lambda function.'
  })

  public readonly getStats = () => this.stats

  public readonly clearStats = () => {
    this.stats.compliantResources = []
    this.stats.nonCompliantResources = []
    this.stats.status = 'LOADED'
    this.stats.errorMessage = []
  }

  public readonly check = async () => {
    this.stats.status = 'CHECKING'

    await this.checkImpl()
      .then(() => {
        this.stats.status = 'FINISHED'
      })
      .catch((err) => {
        this.stats.status = 'ERROR'
        this.stats.errorMessage.push({
          date: new Date(),
          message: err.message
        })
      })
  }

  private readonly checkImpl = async () => {
    const compliantResources: string[] = []
    const nonCompliantResources: string[] = []
    const functions = await this.getFunctions()

    for (const func of functions) {
      try {
        const response = await this.memoClient.send(new GetPolicyCommand({ FunctionName: func.FunctionName! }))
        const policy = JSON.parse(response.Policy!)

        const hasPublicAccess = policy.Statement.some(
          (statement: unknown) => statement.Principal === '*' || statement.Principal?.AWS === '*'
        )

        if (hasPublicAccess) {
          nonCompliantResources.push(func.FunctionArn!)
        } else {
          compliantResources.push(func.FunctionArn!)
        }
      } catch (error) {
        if ((error as unknown).name === 'ResourceNotFoundException') {
          compliantResources.push(func.FunctionArn!)
        } else {
          throw error
        }
      }
    }

    this.stats.compliantResources = compliantResources
    this.stats.nonCompliantResources = nonCompliantResources
  }

  public readonly fix = async (nonCompliantResources: string[]) => {
    await this.fixImpl(nonCompliantResources)
      .then(() => {
        this.stats.status = 'FINISHED'
      })
      .catch((err) => {
        this.stats.status = 'ERROR'
        this.stats.errorMessage.push({
          date: new Date(),
          message: err.message
        })
      })
  }

  private readonly fixImpl = async (nonCompliantResources: string[]) => {
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
        if ((error as unknown).name !== 'ResourceNotFoundException') {
          throw error
        }
      }
    }
  }

  private readonly getFunctions = async () => {
    const response = await this.memoClient.send(new ListFunctionsCommand({}))
    return response.Functions || []
  }
}
