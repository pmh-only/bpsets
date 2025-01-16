import { EC2Client, GetEbsEncryptionByDefaultCommand, EnableEbsEncryptionByDefaultCommand } from '@aws-sdk/client-ec2'
import { BPSet, BPSetFixFn, BPSetStats } from '../../types'
import { Memorizer } from '../../Memorizer'

export class EC2EbsEncryptionByDefault implements BPSet {
  private readonly client = new EC2Client({})
  private readonly memoClient = Memorizer.memo(this.client)

  public readonly getMetadata = () => ({
    name: 'EC2EbsEncryptionByDefault',
    description: 'Ensures that EBS encryption is enabled by default for all volumes in the AWS account.',
    priority: 1,
    priorityReason:
      'Enabling EBS encryption by default ensures data at rest is encrypted, enhancing security and compliance.',
    awsService: 'EC2',
    awsServiceCategory: 'Compute',
    bestPracticeCategory: 'Security',
    requiredParametersForFix: [],
    isFixFunctionUsesDestructiveCommand: false,
    commandUsedInCheckFunction: [
      {
        name: 'GetEbsEncryptionByDefaultCommand',
        reason: 'Verify if EBS encryption by default is enabled in the AWS account.'
      }
    ],
    commandUsedInFixFunction: [
      {
        name: 'EnableEbsEncryptionByDefaultCommand',
        reason: 'Enable EBS encryption by default for the account.'
      }
    ],
    adviseBeforeFixFunction:
      'Ensure enabling EBS encryption by default aligns with your organization’s security policies.'
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

    const response = await this.client.send(new GetEbsEncryptionByDefaultCommand({}))
    if (response.EbsEncryptionByDefault) {
      compliantResources.push('EBS Encryption By Default')
    } else {
      nonCompliantResources.push('EBS Encryption By Default')
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

  public readonly fixImpl: BPSetFixFn = async () => {
    await this.client.send(new EnableEbsEncryptionByDefaultCommand({}))
  }
}
