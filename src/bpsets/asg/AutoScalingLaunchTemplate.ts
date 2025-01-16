import {
  AutoScalingClient,
  DescribeAutoScalingGroupsCommand,
  UpdateAutoScalingGroupCommand
} from '@aws-sdk/client-auto-scaling'
import { BPSet, BPSetFixFn, BPSetStats } from '../../types'
import { Memorizer } from '../../Memorizer'

export class AutoScalingLaunchTemplate implements BPSet {
  private readonly client = new AutoScalingClient({})
  private readonly memoClient = Memorizer.memo(this.client)

  private readonly getAutoScalingGroups = async () => {
    const response = await this.memoClient.send(new DescribeAutoScalingGroupsCommand({}))
    return response.AutoScalingGroups || []
  }

  public readonly getMetadata = () => ({
    name: 'AutoScalingLaunchTemplate',
    description: 'Ensures that Auto Scaling groups use a launch template instead of a launch configuration.',
    priority: 3,
    priorityReason: 'Launch templates provide enhanced capabilities and flexibility compared to launch configurations.',
    awsService: 'Auto Scaling',
    awsServiceCategory: 'Compute',
    bestPracticeCategory: 'Management',
    requiredParametersForFix: [
      {
        name: 'launch-template-id',
        description: 'The ID of the launch template to associate.',
        default: '',
        example: 'lt-0abcd1234efgh5678'
      },
      {
        name: 'version',
        description: 'The version of the launch template to use.',
        default: '$Default',
        example: '$Default'
      }
    ],
    isFixFunctionUsesDestructiveCommand: false,
    commandUsedInCheckFunction: [
      {
        name: 'DescribeAutoScalingGroupsCommand',
        reason: 'Retrieve Auto Scaling groups to check for launch template usage.'
      }
    ],
    commandUsedInFixFunction: [
      {
        name: 'UpdateAutoScalingGroupCommand',
        reason: 'Associate the Auto Scaling group with the specified launch template.'
      }
    ],
    adviseBeforeFixFunction:
      'Ensure the launch template is configured properly before associating it with an Auto Scaling group.'
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
      if (asg.LaunchConfigurationName) {
        nonCompliantResources.push(asg.AutoScalingGroupARN!)
      } else {
        compliantResources.push(asg.AutoScalingGroupARN!)
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
    const launchTemplateId = requiredParametersForFix.find((param) => param.name === 'launch-template-id')?.value
    const version = requiredParametersForFix.find((param) => param.name === 'version')?.value

    if (!launchTemplateId || !version) {
      throw new Error("Required parameters 'launch-template-id' and/or 'version' are missing.")
    }

    for (const asgArn of nonCompliantResources) {
      const asgName = asgArn.split(':').pop()!
      await this.client.send(
        new UpdateAutoScalingGroupCommand({
          AutoScalingGroupName: asgName,
          LaunchTemplate: {
            LaunchTemplateId: launchTemplateId,
            Version: version
          }
        })
      )
    }
  }
}
