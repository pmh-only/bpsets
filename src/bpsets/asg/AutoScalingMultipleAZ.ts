import {
  AutoScalingClient,
  DescribeAutoScalingGroupsCommand,
  UpdateAutoScalingGroupCommand
} from '@aws-sdk/client-auto-scaling'
import { BPSet, BPSetFixFn, BPSetStats } from '../../types'
import { Memorizer } from '../../Memorizer'

export class AutoScalingMultipleAZ implements BPSet {
  private readonly client = new AutoScalingClient({})
  private readonly memoClient = Memorizer.memo(this.client)

  private readonly getAutoScalingGroups = async () => {
    const response = await this.memoClient.send(new DescribeAutoScalingGroupsCommand({}))
    return response.AutoScalingGroups || []
  }

  public readonly getMetadata = () => ({
    name: 'AutoScalingMultipleAZ',
    description: 'Ensures that Auto Scaling groups are configured to use multiple Availability Zones.',
    priority: 2,
    priorityReason: 'Using multiple AZs improves fault tolerance and availability for Auto Scaling groups.',
    awsService: 'Auto Scaling',
    awsServiceCategory: 'Compute',
    bestPracticeCategory: 'Resilience',
    requiredParametersForFix: [
      {
        name: 'availability-zones',
        description: 'Comma-separated list of Availability Zones to assign to the Auto Scaling group.',
        default: '',
        example: 'us-east-1a,us-east-1b'
      }
    ],
    isFixFunctionUsesDestructiveCommand: false,
    commandUsedInCheckFunction: [
      {
        name: 'DescribeAutoScalingGroupsCommand',
        reason: 'Retrieve Auto Scaling groups to verify their Availability Zone configuration.'
      }
    ],
    commandUsedInFixFunction: [
      {
        name: 'UpdateAutoScalingGroupCommand',
        reason: 'Update the Auto Scaling group to use the specified Availability Zones.'
      }
    ],
    adviseBeforeFixFunction:
      'Ensure that the specified Availability Zones are correctly configured in your infrastructure.'
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
    const asgs = await this.getAutoScalingGroups()

    for (const asg of asgs) {
      if ((asg.AvailabilityZones?.length ?? 0) > 1) {
        compliantResources.push(asg.AutoScalingGroupARN!)
      } else {
        nonCompliantResources.push(asg.AutoScalingGroupARN!)
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

  public readonly fixImpl: BPSetFixFn = async (nonCompliantResources, requiredParametersForFix) => {
    const availabilityZones = requiredParametersForFix.find((param) => param.name === 'availability-zones')?.value

    if (!availabilityZones) {
      throw new Error("Required parameter 'availability-zones' is missing.")
    }

    for (const asgArn of nonCompliantResources) {
      const asgName = asgArn.split(':').pop()!
      await this.client.send(
        new UpdateAutoScalingGroupCommand({
          AutoScalingGroupName: asgName,
          AvailabilityZones: availabilityZones.split(',')
        })
      )
    }
  }
}
