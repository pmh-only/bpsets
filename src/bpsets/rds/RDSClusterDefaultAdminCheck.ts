import {
  RDSClient,
  DescribeDBClustersCommand,
  ModifyDBClusterCommand
} from '@aws-sdk/client-rds'
import { BPSet } from '../BPSet'
import { Memorizer } from '../../Memorizer'

export class RDSClusterDefaultAdminCheck implements BPSet {
  private readonly client = new RDSClient({})
  private readonly memoClient = Memorizer.memo(this.client)

  private readonly getDBClusters = async () => {
    const response = await this.memoClient.send(new DescribeDBClustersCommand({}))
    return response.DBClusters || []
  }

  public readonly check = async () => {
    const compliantResources = []
    const nonCompliantResources = []
    const dbClusters = await this.getDBClusters()

    for (const cluster of dbClusters) {
      if (!['admin', 'postgres'].includes(cluster.MasterUsername!)) {
        compliantResources.push(cluster.DBClusterArn!)
      } else {
        nonCompliantResources.push(cluster.DBClusterArn!)
      }
    }

    return {
      compliantResources,
      nonCompliantResources,
      requiredParametersForFix: [
        { name: 'new-master-username', value: '<NEW_MASTER_USERNAME>' },
        { name: 'new-master-password', value: '<NEW_MASTER_PASSWORD>' }
      ]
    }
  }

  public readonly fix = async (
    nonCompliantResources: string[],
    requiredParametersForFix: { name: string; value: string }[]
  ) => {
    const newMasterUsername = requiredParametersForFix.find(
      param => param.name === 'new-master-username'
    )?.value
    const newMasterPassword = requiredParametersForFix.find(
      param => param.name === 'new-master-password'
    )?.value

    if (!newMasterUsername || !newMasterPassword) {
      throw new Error("Required parameters 'new-master-username' and 'new-master-password' are missing.")
    }

    for (const arn of nonCompliantResources) {
      const clusterId = arn.split(':cluster/')[1]

      await this.client.send(
        new ModifyDBClusterCommand({
          DBClusterIdentifier: clusterId,
          MasterUserPassword: newMasterPassword
        })
      )
    }
  }
}
