import {
  ECRClient,
  DescribeRepositoriesCommand,
  PutImageTagMutabilityCommand,
} from '@aws-sdk/client-ecr';
import { BPSet, BPSetFixFn, BPSetStats } from '../../types';
import { Memorizer } from '../../Memorizer';

export class ECRPrivateTagImmutabilityEnabled implements BPSet {
  private readonly client = new ECRClient({});
  private readonly memoClient = Memorizer.memo(this.client);

  private readonly getRepositories = async () => {
    const response = await this.memoClient.send(new DescribeRepositoriesCommand({}));
    return response.repositories || [];
  };

  public readonly getMetadata = () => ({
    name: 'ECRPrivateTagImmutabilityEnabled',
    description: 'Ensures that private ECR repositories have tag immutability enabled.',
    priority: 3,
    priorityReason:
      'Enabling tag immutability prevents accidental overwrites of image tags, ensuring integrity and reproducibility.',
    awsService: 'ECR',
    awsServiceCategory: 'Container',
    bestPracticeCategory: 'Security',
    requiredParametersForFix: [],
    isFixFunctionUsesDestructiveCommand: false,
    commandUsedInCheckFunction: [
      {
        name: 'DescribeRepositoriesCommand',
        reason: 'Retrieve all ECR repositories to check their tag mutability setting.',
      },
    ],
    commandUsedInFixFunction: [
      {
        name: 'PutImageTagMutabilityCommand',
        reason: 'Set image tag immutability for non-compliant repositories.',
      },
    ],
    adviseBeforeFixFunction:
      'Ensure that enabling tag immutability aligns with your development and deployment processes.',
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
    const repositories = await this.getRepositories();

    for (const repository of repositories) {
      if (repository.imageTagMutability === 'IMMUTABLE') {
        compliantResources.push(repository.repositoryArn!);
      } else {
        nonCompliantResources.push(repository.repositoryArn!);
      }
    }

    this.stats.compliantResources = compliantResources;
    this.stats.nonCompliantResources = nonCompliantResources;
  };

  public readonly fix: BPSetFixFn = async (...args) => {
    await this.fixImpl(...args).then(
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

  public readonly fixImpl: BPSetFixFn = async (nonCompliantResources) => {
    for (const arn of nonCompliantResources) {
      const repositoryName = arn.split('/').pop()!;

      await this.client.send(
        new PutImageTagMutabilityCommand({
          repositoryName,
          imageTagMutability: 'IMMUTABLE',
        })
      );
    }
  };
}

