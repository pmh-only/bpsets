import {
  ElastiCacheClient,
  DescribeReplicationGroupsCommand,
  ModifyReplicationGroupCommand
} from '@aws-sdk/client-elasticache'
import { BPSet } from '../BPSet'
import { Memorizer } from '../../Memorizer'

export class ElastiCacheReplGrpEncryptedAtRest implements BPSet {
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
      if (group.AtRestEncryptionEnabled) {
        compliantResources.push(group.ARN!)
      } else {
        nonCompliantResources.push(group.ARN!)
      }
    }

    return {
      compliantResources,
      nonCompliantResources,
      requiredParametersForFix: []
    }
  }

  public readonly fix = async (nonCompliantResources: string[]) => {
    throw new Error(
      'Fixing encryption at rest for replication groups requires recreation. Please create a new replication group with AtRestEncryptionEnabled set to true.'
    )
  }
}
