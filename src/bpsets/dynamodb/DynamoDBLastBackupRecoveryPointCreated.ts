import {
  DynamoDBClient,
  ListTablesCommand,
  DescribeTableCommand
} from '@aws-sdk/client-dynamodb'
import {
  BackupClient,
  ListRecoveryPointsByResourceCommand,
  StartBackupJobCommand
} from '@aws-sdk/client-backup'
import { BPSet } from '../BPSet'
import { Memorizer } from '../../Memorizer'

export class DynamoDBLastBackupRecoveryPointCreated implements BPSet {
  private readonly client = new DynamoDBClient({})
  private readonly backupClient = new BackupClient({})
  private readonly memoClient = Memorizer.memo(this.client)

  private readonly getTables = async () => {
    const tableNames = await this.memoClient.send(new ListTablesCommand({}))
    const tables = []
    for (const tableName of tableNames.TableNames || []) {
      const tableDetails = await this.memoClient.send(
        new DescribeTableCommand({ TableName: tableName })
      )
      tables.push(tableDetails.Table!)
    }
    return tables
  }

  public readonly check = async () => {
    const compliantResources = []
    const nonCompliantResources = []
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
        .map(point => new Date(point.CreationDate!))
        .sort((a, b) => b.getTime() - a.getTime())[0]

      if (new Date().getTime() - latestRecoveryPoint.getTime() > 86400000) {
        nonCompliantResources.push(table.TableArn!)
      } else {
        compliantResources.push(table.TableArn!)
      }
    }

    return {
      compliantResources,
      nonCompliantResources,
      requiredParametersForFix: []
    }
  }

  public readonly fix = async (nonCompliantResources: string[]) => {
    for (const arn of nonCompliantResources) {
      await this.backupClient.send(
        new StartBackupJobCommand({
          ResourceArn: arn,
          BackupVaultName: 'Default',
          IamRoleArn: 'arn:aws:iam::account-id:role/service-role/BackupDefaultServiceRole',
        })
      )
    }
  }
}
