<?php

declare(strict_types=1);

namespace Wwwision\DcbExampleGenerator;

use Wwwision\DcbExampleGenerator\commandDefinition\CommandDefinition;
use Wwwision\DcbExampleGenerator\commandHandlerDefinition\CommandHandlerDefinition;
use Wwwision\DcbExampleGenerator\eventDefinition\EventDefinition;
use Wwwision\DcbExampleGenerator\projection\Projection;
use Wwwision\DcbExampleGenerator\testCase\TestCase;

final readonly class MergeResult
{
    /**
     * @param array<string> $newEventDefinitionNames
     * @param array<string> $newCommandDefinitionNames
     * @param array<string> $newProjectionNames
     * @param array<string> $newCommandHandlerDefinitionCommandNames
     * @param array<string> $newTestCaseDescriptions
     */
    public function __construct(
        public Example $mergedExample,
        private array $newEventDefinitionNames = [],
        private array $newCommandDefinitionNames = [],
        private array $newProjectionNames = [],
        private array $newCommandHandlerDefinitionCommandNames = [],
        private array $newTestCaseDescriptions = [],
    ) {}

    public function isNewEventDefinition(EventDefinition $eventDefinition): bool
    {
        return in_array($eventDefinition->name, $this->newEventDefinitionNames, true);
    }

    public function isNewCommandDefinition(CommandDefinition $commandDefinition): bool
    {
        return in_array($commandDefinition->name, $this->newCommandDefinitionNames, true);
    }

    public function isNewProjection(Projection $projection): bool
    {
        return in_array($projection->name, $this->newProjectionNames, true);
    }

    public function isNewCommandHandlerDefinition(CommandHandlerDefinition $commandHandlerDefinition): bool
    {
        return in_array($commandHandlerDefinition->commandName, $this->newCommandHandlerDefinitionCommandNames, true);
    }

    public function isNewTestCase(TestCase $testCase): bool
    {
        return in_array($testCase->description, $this->newTestCaseDescriptions, true);
    }
}
