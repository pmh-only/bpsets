import {
  EC2Client,
  DescribeInstancesCommand,
} from '@aws-sdk/client-ec2';
import { BPSet, BPSetStats } from '../../types';
import { Memorizer } from '../../Memorizer';

export class EC2NoAmazonKeyPair implements BPSet {
  private readonly client = new EC2Client({});
  private readonly memoClient = Memorizer.memo(this.client);

  public readonly getMetadata = () => ({
    name: 'EC2NoAmazonKeyPair',
    description: 'Ensures that EC2 instances are not using an Amazon Key Pair.',
    priority: 3,
    priorityReason: 'Amazon Key Pairs pose a potential security risk if not properly managed.',
    awsService: 'EC2',
    awsServiceCategory: 'Compute',
    bestPracticeCategory: 'Security',
    requiredParametersForFix: [],
    isFixFunctionUsesDestructiveCommand: false,
    commandUsedInCheckFunction: [
      {
        name: 'DescribeInstancesCommand',
        reason: 'Retrieve all EC2 instances and verify if an Amazon Key Pair is used.',
      },
    ],
    commandUsedInFixFunction: [],
    adviseBeforeFixFunction:
      'Ensure instances are launched without a Key Pair or configure SSH access using alternative mechanisms like Systems Manager Session Manager.',
  });

  private readonly stats: BPSetStats = {
    nonCompliantResources: [],
    compliantResources: [],
    status: 'LOADED',
    errorMessage: [],
  };

  public readonly getStats = () => this.stats;

  public readonly clearStats = () => {
    this.stats.compliantResources = [];
    this.stats.nonCompliantResources = [];
    this.stats.status = 'LOADED';
    this.stats.errorMessage = [];
  };

  public readonly check = async () => {
    this.stats.status = 'CHECKING';

    await this.checkImpl().then(
      () => (this.stats.status = 'FINISHED'),
      (err) => {
        this.stats.status = 'ERROR';
        this.stats.errorMessage.push({
          date: new Date(),
          message: err.message,
        });
      }
    );
  };

  private readonly checkImpl = async () => {
    const compliantResources: string[] = [];
    const nonCompliantResources: string[] = [];
    const response = await this.memoClient.send(new DescribeInstancesCommand({}));

    for (const reservation of response.Reservations || []) {
      for (const instance of reservation.Instances || []) {
        if (instance.State?.Name === 'terminated')
          continue
        
        if (instance.KeyName) {
          nonCompliantResources.push(instance.InstanceId!);
        } else {
          compliantResources.push(instance.InstanceId!);
        }
      }
    }

    this.stats.compliantResources = compliantResources;
    this.stats.nonCompliantResources = nonCompliantResources;
  };

  public readonly fix = async () => {
    throw new Error(
      'Fix logic for EC2NoAmazonKeyPair is not applicable. Key pairs must be removed manually or during instance creation.'
    );
  };
}
