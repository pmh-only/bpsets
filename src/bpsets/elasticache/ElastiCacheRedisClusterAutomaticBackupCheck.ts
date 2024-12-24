import {
  ElastiCacheClient,
  DescribeReplicationGroupsCommand,
  ModifyReplicationGroupCommand
} from '@aws-sdk/client-elasticache'
import { BPSet } from '../../types'
import { Memorizer } from '../../Memorizer'

export class ElastiCacheRedisClusterAutomaticBackupCheck implements BPSet {
  private readonly client = new ElastiCacheClient({})
  private readonly memoClient = Memorizer.memo(this.client)

  private readonly getReplicationGroups = async () => {
    const response = await this.memoClient.send(new DescribeReplicationGroupsCommand({}))
    return response.ReplicationGroups || []
  }

  public readonly check = async () => {
    const compliantResources = []
    const nonCompliantResources = []
    const replicationGroups = await this.getReplicationGroups()

    for (const group of replicationGroups) {
      if (group.SnapshottingClusterId) {
        compliantResources.push(group.ARN!)
      } else {
        nonCompliantResources.push(group.ARN!)
      }
    }

    return {
      compliantResources,
      nonCompliantResources,
      requiredParametersForFix: [{ name: 'snapshot-retention-period' }]
    }
  }

  public readonly fix = async (
    nonCompliantResources: string[],
    requiredParametersForFix: { name: string; value: string }[]
  ) => {
    const retentionPeriod = requiredParametersForFix.find(
      param => param.name === 'snapshot-retention-period'
    )?.value

    if (!retentionPeriod) {
      throw new Error("Required parameter 'snapshot-retention-period' is missing.")
    }

    for (const arn of nonCompliantResources) {
      const groupId = arn.split(':replication-group:')[1]
      await this.client.send(
        new ModifyReplicationGroupCommand({
          ReplicationGroupId: groupId,
          SnapshotRetentionLimit: parseInt(retentionPeriod, 10)
        })
      )
    }
  }
}
