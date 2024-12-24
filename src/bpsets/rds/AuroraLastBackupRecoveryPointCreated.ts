import {
  RDSClient,
  DescribeDBClustersCommand,
  ModifyDBClusterCommand
} from '@aws-sdk/client-rds'
import {
  BackupClient,
  ListRecoveryPointsByResourceCommand
} from '@aws-sdk/client-backup'
import { BPSet } from '../BPSet'
import { Memorizer } from '../../Memorizer'

export class AuroraLastBackupRecoveryPointCreated implements BPSet {
  private readonly rdsClient = new RDSClient({})
  private readonly backupClient = new BackupClient({})
  private readonly memoRdsClient = Memorizer.memo(this.rdsClient)

  private readonly getDBClusters = async () => {
    const response = await this.memoRdsClient.send(new DescribeDBClustersCommand({}))
    return response.DBClusters || []
  }

  private readonly getRecoveryPoints = async (resourceArn: string) => {
    const response = await this.backupClient.send(
      new ListRecoveryPointsByResourceCommand({ ResourceArn: resourceArn })
    )
    return response.RecoveryPoints || []
  }

  public readonly check = async () => {
    const compliantResources = []
    const nonCompliantResources = []
    const dbClusters = await this.getDBClusters()

    for (const cluster of dbClusters) {
      const recoveryPoints = await this.getRecoveryPoints(cluster.DBClusterArn!)
      const recoveryDates = recoveryPoints.map(rp => new Date(rp.CreationDate!))
      recoveryDates.sort((a, b) => b.getTime() - a.getTime())

      if (
        recoveryDates.length > 0 &&
        new Date().getTime() - recoveryDates[0].getTime() < 24 * 60 * 60 * 1000
      ) {
        compliantResources.push(cluster.DBClusterArn!)
      } else {
        nonCompliantResources.push(cluster.DBClusterArn!)
      }
    }

    return {
      compliantResources,
      nonCompliantResources,
      requiredParametersForFix: [{ name: 'backup-retention-period', value: '7' }]
    }
  }

  public readonly fix = async (
    nonCompliantResources: string[],
    requiredParametersForFix: { name: string; value: string }[]
  ) => {
    const retentionPeriod = requiredParametersForFix.find(
      param => param.name === 'backup-retention-period'
    )?.value

    if (!retentionPeriod) {
      throw new Error("Required parameter 'backup-retention-period' is missing.")
    }

    for (const arn of nonCompliantResources) {
      const clusterId = arn.split(':cluster/')[1]

      await this.rdsClient.send(
        new ModifyDBClusterCommand({
          DBClusterIdentifier: clusterId,
          BackupRetentionPeriod: parseInt(retentionPeriod, 10)
        })
      )
    }
  }
}
