import {
  DynamoDBClient,
  ListTablesCommand,
  DescribeTableCommand,
  DescribeContinuousBackupsCommand,
  UpdateContinuousBackupsCommand
} from '@aws-sdk/client-dynamodb'
import { BPSet, BPSetFixFn, BPSetStats } from '../../types'
import { Memorizer } from '../../Memorizer'

export class DynamoDBPITREnabled implements BPSet {
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
    name: 'DynamoDBPITREnabled',
    description: 'Ensures that Point-In-Time Recovery (PITR) is enabled for DynamoDB tables.',
    priority: 1,
    priorityReason:
      'PITR provides continuous backups of DynamoDB tables, enabling recovery to any second within the last 35 days.',
    awsService: 'DynamoDB',
    awsServiceCategory: 'Database',
    bestPracticeCategory: 'Backup and Recovery',
    requiredParametersForFix: [],
    isFixFunctionUsesDestructiveCommand: false,
    commandUsedInCheckFunction: [
      {
        name: 'ListTablesCommand',
        reason: 'Retrieve the list of DynamoDB tables to verify PITR settings.'
      },
      {
        name: 'DescribeTableCommand',
        reason: 'Fetch details of each DynamoDB table.'
      },
      {
        name: 'DescribeContinuousBackupsCommand',
        reason: 'Check if PITR is enabled for each table.'
      }
    ],
    commandUsedInFixFunction: [
      {
        name: 'UpdateContinuousBackupsCommand',
        reason: 'Enable PITR for non-compliant DynamoDB tables.'
      }
    ],
    adviseBeforeFixFunction:
      'Ensure enabling PITR aligns with organizational backup policies and compliance requirements.'
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
      const backupStatus = await this.memoClient.send(
        new DescribeContinuousBackupsCommand({
          TableName: table.TableName!
        })
      )

      if (
        backupStatus.ContinuousBackupsDescription?.PointInTimeRecoveryDescription?.PointInTimeRecoveryStatus ===
        'ENABLED'
      ) {
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
        new UpdateContinuousBackupsCommand({
          TableName: tableName,
          PointInTimeRecoverySpecification: {
            PointInTimeRecoveryEnabled: true
          }
        })
      )
    }
  }
}
