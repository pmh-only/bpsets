import { EC2Client, DescribeInstancesCommand, TerminateInstancesCommand } from '@aws-sdk/client-ec2'
import { BPSet, BPSetFixFn, BPSetStats } from '../../types'
import { Memorizer } from '../../Memorizer'

export class EC2StoppedInstance implements BPSet {
  private readonly client = new EC2Client({})
  private readonly memoClient = Memorizer.memo(this.client)

  public readonly getMetadata = () => ({
    name: 'EC2StoppedInstance',
    description: 'Ensures that stopped EC2 instances are identified and terminated if necessary.',
    priority: 3,
    priorityReason: 'Stopped instances can incur costs for storage and IP addresses without being in use.',
    awsService: 'EC2',
    awsServiceCategory: 'Compute',
    bestPracticeCategory: 'Cost Optimization',
    requiredParametersForFix: [],
    isFixFunctionUsesDestructiveCommand: true,
    commandUsedInCheckFunction: [
      {
        name: 'DescribeInstancesCommand',
        reason: 'Retrieve EC2 instances to check their state.'
      }
    ],
    commandUsedInFixFunction: [
      {
        name: 'TerminateInstancesCommand',
        reason: 'Terminate stopped EC2 instances to prevent unnecessary costs.'
      }
    ],
    adviseBeforeFixFunction:
      'Ensure terminated instances do not contain any critical data or configurations before proceeding.'
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
    const response = await this.memoClient.send(new DescribeInstancesCommand({}))

    for (const reservation of response.Reservations || []) {
      for (const instance of reservation.Instances || []) {
        if (instance.State?.Name === 'stopped') {
          nonCompliantResources.push(instance.InstanceId!)
        } else {
          compliantResources.push(instance.InstanceId!)
        }
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
    if (nonCompliantResources.length === 0) {
      return // No stopped instances to terminate
    }

    await this.client.send(
      new TerminateInstancesCommand({
        InstanceIds: nonCompliantResources
      })
    )
  }
}
