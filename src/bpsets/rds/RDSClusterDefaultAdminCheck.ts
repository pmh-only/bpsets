import { RDSClient, DescribeDBClustersCommand, ModifyDBClusterCommand } from '@aws-sdk/client-rds'
import { BPSet, BPSetMetadata, BPSetStats } from '../../types'
import { Memorizer } from '../../Memorizer'

export class RDSClusterDefaultAdminCheck implements BPSet {
  private readonly client = new RDSClient({})
  private readonly memoClient = Memorizer.memo(this.client)

  private readonly stats: BPSetStats = {
    compliantResources: [],
    nonCompliantResources: [],
    status: 'LOADED',
    errorMessage: []
  }

  public readonly getMetadata = (): BPSetMetadata => ({
    name: 'RDSClusterDefaultAdminCheck',
    description: 'Ensures that RDS clusters do not use default administrative usernames (e.g., admin, postgres).',
    priority: 2,
    priorityReason: 'Using default administrative usernames increases the risk of brute force attacks.',
    awsService: 'RDS',
    awsServiceCategory: 'Database',
    bestPracticeCategory: 'Security',
    requiredParametersForFix: [
      {
        name: 'new-master-username',
        description: 'The new master username for the RDS cluster.',
        default: '',
        example: 'secureAdminUser'
      },
      {
        name: 'new-master-password',
        description: 'The new master password for the RDS cluster.',
        default: '',
        example: 'SecureP@ssword123'
      }
    ],
    isFixFunctionUsesDestructiveCommand: true,
    commandUsedInCheckFunction: [
      {
        name: 'DescribeDBClustersCommand',
        reason: 'Fetches information about RDS clusters, including their master username.'
      }
    ],
    commandUsedInFixFunction: [
      {
        name: 'ModifyDBClusterCommand',
        reason: 'Updates the master user password for non-compliant RDS clusters.'
      }
    ],
    adviseBeforeFixFunction: 'Ensure that the new master username and password comply with your security policies.'
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
    const dbClusters = await this.getDBClusters()

    for (const cluster of dbClusters) {
      if (!['admin', 'postgres'].includes(cluster.MasterUsername!)) {
        compliantResources.push(cluster.DBClusterArn!)
      } else {
        nonCompliantResources.push(cluster.DBClusterArn!)
      }
    }

    this.stats.compliantResources = compliantResources
    this.stats.nonCompliantResources = nonCompliantResources
  }

  public readonly fix = async (
    nonCompliantResources: string[],
    requiredParametersForFix: { name: string; value: string }[]
  ) => {
    await this.fixImpl(nonCompliantResources, requiredParametersForFix)
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

  private readonly fixImpl = async (
    nonCompliantResources: string[],
    requiredParametersForFix: { name: string; value: string }[]
  ) => {
    const newMasterUsername = requiredParametersForFix.find((param) => param.name === 'new-master-username')?.value
    const newMasterPassword = requiredParametersForFix.find((param) => param.name === 'new-master-password')?.value

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

  private readonly getDBClusters = async () => {
    const response = await this.memoClient.send(new DescribeDBClustersCommand({}))
    return response.DBClusters || []
  }
}
