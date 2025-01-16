import { DynamoDBClient, ListTablesCommand, DescribeTableCommand } from '@aws-sdk/client-dynamodb'
import { BackupClient, ListRecoveryPointsByResourceCommand, StartBackupJobCommand } from '@aws-sdk/client-backup'
import { STSClient, GetCallerIdentityCommand } from '@aws-sdk/client-sts'
import { BPSet, BPSetFixFn, BPSetStats } from '../../types'
import { Memorizer } from '../../Memorizer'

export class DynamoDBLastBackupRecoveryPointCreated implements BPSet {
  private readonly client = new DynamoDBClient({})
  private readonly backupClient = new BackupClient({})
  private readonly stsClient = new STSClient({})
  private readonly memoClient = Memorizer.memo(this.client)

  private accountId: string | undefined

  private readonly fetchAccountId = async () => {
    if (!this.accountId) {
      const identity = await this.stsClient.send(new GetCallerIdentityCommand({}))
      this.accountId = identity.Account!
    }
    return this.accountId
  }

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
    name: 'DynamoDBLastBackupRecoveryPointCreated',
    description: 'Ensures that DynamoDB tables have a recent recovery point within the last 24 hours.',
    priority: 3,
    priorityReason: 'Recent backups are critical for data recovery and minimizing data loss.',
    awsService: 'DynamoDB',
    awsServiceCategory: 'Database',
    bestPracticeCategory: 'Backup and Recovery',
    requiredParametersForFix: [],
    isFixFunctionUsesDestructiveCommand: false,
    commandUsedInCheckFunction: [
      {
        name: 'ListTablesCommand',
        reason: 'Retrieve the list of DynamoDB tables to check for backups.'
      },
      {
        name: 'DescribeTableCommand',
        reason: 'Fetch details of each DynamoDB table.'
      },
      {
        name: 'ListRecoveryPointsByResourceCommand',
        reason: 'Check recovery points for DynamoDB tables in AWS Backup.'
      }
    ],
    commandUsedInFixFunction: [
      {
        name: 'StartBackupJobCommand',
        reason: 'Initiate a backup job for non-compliant DynamoDB tables.'
      }
    ],
    adviseBeforeFixFunction: 'Ensure the backup vault and IAM role are properly configured for your backup strategy.'
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
      const recoveryPointsResponse = await this.backupClient.send(
        new ListRecoveryPointsByResourceCommand({
          ResourceArn: table.TableArn
        })
      )
      const recoveryPoints = recoveryPointsResponse.RecoveryPoints || []

      if (recoveryPoints.length === 0) {
        nonCompliantResources.push(table.TableArn!)
        continue
      }

      const latestRecoveryPoint = recoveryPoints
        .map((point) => new Date(point.CreationDate!))
        .sort((a, b) => b.getTime() - a.getTime())[0]

      if (new Date().getTime() - latestRecoveryPoint.getTime() > 86400000) {
        nonCompliantResources.push(table.TableArn!)
      } else {
        compliantResources.push(table.TableArn!)
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
    const accountId = await this.fetchAccountId()

    for (const arn of nonCompliantResources) {
      await this.backupClient.send(
        new StartBackupJobCommand({
          ResourceArn: arn,
          BackupVaultName: 'Default',
          IamRoleArn: `arn:aws:iam::${accountId}:role/service-role/BackupDefaultServiceRole`
        })
      )
    }
  }
}
