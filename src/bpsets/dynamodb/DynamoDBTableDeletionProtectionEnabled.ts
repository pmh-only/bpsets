import { DynamoDBClient, ListTablesCommand, DescribeTableCommand, UpdateTableCommand } from '@aws-sdk/client-dynamodb'
import { BPSet, BPSetFixFn, BPSetStats } from '../../types'
import { Memorizer } from '../../Memorizer'

export class DynamoDBTableDeletionProtectionEnabled implements BPSet {
  private readonly client = new DynamoDBClient({})
  private readonly memoClient = Memorizer.memo(this.client)

  private readonly getTables = async () => {
    const tableNames = await this.memoClient.send(new ListTablesCommand({}))
    const tables = []
    for (const tableName of tableNames.TableNames || []) {
      const tableDetails = await this.memoClient.send(new DescribeTableCommand({ TableName: tableName }))
      tables.push(tableDetails.Table!)
    }
    return tables
  }

  public readonly getMetadata = () => ({
    name: 'DynamoDBTableDeletionProtectionEnabled',
    description: 'Ensures that deletion protection is enabled for DynamoDB tables.',
    priority: 2,
    priorityReason: 'Deletion protection prevents accidental table deletion, safeguarding critical data.',
    awsService: 'DynamoDB',
    awsServiceCategory: 'Database',
    bestPracticeCategory: 'Security',
    requiredParametersForFix: [],
    isFixFunctionUsesDestructiveCommand: false,
    commandUsedInCheckFunction: [
      {
        name: 'ListTablesCommand',
        reason: 'Retrieve the list of DynamoDB tables to verify deletion protection.'
      },
      {
        name: 'DescribeTableCommand',
        reason: 'Fetch details of each DynamoDB table, including deletion protection settings.'
      }
    ],
    commandUsedInFixFunction: [
      {
        name: 'UpdateTableCommand',
        reason: 'Enable deletion protection for non-compliant DynamoDB tables.'
      }
    ],
    adviseBeforeFixFunction: 'Ensure enabling deletion protection aligns with operational and compliance requirements.'
  })

  private readonly stats: BPSetStats = {
    nonCompliantResources: [],
    compliantResources: [],
    status: 'LOADED',
    errorMessage: []
  }

  public readonly getStats = () => this.stats

  public readonly clearStats = () => {
    this.stats.compliantResources = []
    this.stats.nonCompliantResources = []
    this.stats.status = 'LOADED'
    this.stats.errorMessage = []
  }

  public readonly check = async () => {
    this.stats.status = 'CHECKING'

    await this.checkImpl().then(
      () => (this.stats.status = 'FINISHED'),
      (err) => {
        this.stats.status = 'ERROR'
        this.stats.errorMessage.push({
          date: new Date(),
          message: err.message
        })
      }
    )
  }

  private readonly checkImpl = async () => {
    const compliantResources: string[] = []
    const nonCompliantResources: string[] = []
    const tables = await this.getTables()

    for (const table of tables) {
      if (table.DeletionProtectionEnabled) {
        compliantResources.push(table.TableArn!)
      } else {
        nonCompliantResources.push(table.TableArn!)
      }
    }

    this.stats.compliantResources = compliantResources
    this.stats.nonCompliantResources = nonCompliantResources
  }

  public readonly fix: BPSetFixFn = async (...args) => {
    await this.fixImpl(...args).then(
      () => (this.stats.status = 'FINISHED'),
      (err) => {
        this.stats.status = 'ERROR'
        this.stats.errorMessage.push({
          date: new Date(),
          message: err.message
        })
      }
    )
  }

  public readonly fixImpl: BPSetFixFn = async (nonCompliantResources) => {
    for (const arn of nonCompliantResources) {
      const tableName = arn.split('/').pop()!

      await this.client.send(
        new UpdateTableCommand({
          TableName: tableName,
          DeletionProtectionEnabled: true
        })
      )
    }
  }
}
