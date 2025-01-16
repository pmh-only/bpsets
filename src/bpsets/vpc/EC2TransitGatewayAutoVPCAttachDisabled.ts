import { EC2Client, DescribeTransitGatewaysCommand, ModifyTransitGatewayCommand } from '@aws-sdk/client-ec2'
import { BPSet, BPSetMetadata, BPSetStats } from '../../types'
import { Memorizer } from '../../Memorizer'

export class EC2TransitGatewayAutoVPCAttachDisabled implements BPSet {
  private readonly client = new EC2Client({})
  private readonly memoClient = Memorizer.memo(this.client)

  private readonly stats: BPSetStats = {
    compliantResources: [],
    nonCompliantResources: [],
    status: 'LOADED',
    errorMessage: []
  }

  public readonly getMetadata = (): BPSetMetadata => ({
    name: 'EC2TransitGatewayAutoVPCAttachDisabled',
    description: 'Ensures that Transit Gateways have Auto VPC Attachments disabled.',
    priority: 2,
    priorityReason: 'Disabling Auto VPC Attachments reduces the risk of unintentional or unauthorized VPC attachments.',
    awsService: 'EC2',
    awsServiceCategory: 'Networking',
    bestPracticeCategory: 'Security',
    requiredParametersForFix: [],
    isFixFunctionUsesDestructiveCommand: false,
    commandUsedInCheckFunction: [
      {
        name: 'DescribeTransitGatewaysCommand',
        reason: 'Fetches information about Transit Gateways and their configurations.'
      }
    ],
    commandUsedInFixFunction: [
      {
        name: 'ModifyTransitGatewayCommand',
        reason: 'Disables Auto VPC Attachments for non-compliant Transit Gateways.'
      }
    ],
    adviseBeforeFixFunction: 'Ensure there are no dependencies on Auto VPC Attachments before disabling it.'
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

    const response = await this.memoClient.send(new DescribeTransitGatewaysCommand({}))
    const transitGateways = response.TransitGateways || []

    for (const gateway of transitGateways) {
      if (gateway.Options?.AutoAcceptSharedAttachments === 'enable') {
        nonCompliantResources.push(gateway.TransitGatewayArn!)
      } else {
        compliantResources.push(gateway.TransitGatewayArn!)
      }
    }

    this.stats.compliantResources = compliantResources
    this.stats.nonCompliantResources = nonCompliantResources
  }

  public readonly fix = async (nonCompliantResources: string[]) => {
    this.stats.status = 'CHECKING'

    await this.fixImpl(nonCompliantResources)
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

  private readonly fixImpl = async (nonCompliantResources: string[]) => {
    for (const arn of nonCompliantResources) {
      const transitGatewayId = arn.split(':transit-gateway/')[1]

      await this.client.send(
        new ModifyTransitGatewayCommand({
          TransitGatewayId: transitGatewayId,
          Options: {
            AutoAcceptSharedAttachments: 'disable'
          }
        })
      )
    }
  }
}
