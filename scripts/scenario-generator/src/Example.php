<?php

declare(strict_types=1);

namespace Wwwision\DcbExampleGenerator;

use Webmozart\Assert\Assert;
use Wwwision\DcbExampleGenerator\commandDefinition\CommandDefinition;
use Wwwision\DcbExampleGenerator\commandDefinition\CommandDefinitions;
use Wwwision\DcbExampleGenerator\commandHandlerDefinition\CommandHandlerDefinition;
use Wwwision\DcbExampleGenerator\commandHandlerDefinition\CommandHandlerDefinitions;
use Wwwision\DcbExampleGenerator\eventDefinition\EventDefinitions;
use Wwwision\DcbExampleGenerator\projection\Projection;
use Wwwision\DcbExampleGenerator\projection\Projections;
use Wwwision\DcbExampleGenerator\shared\PropertyDefinitions;
use Wwwision\DcbExampleGenerator\shared\TemplateString;
use Wwwision\DcbExampleGenerator\testCase\TestCases;
use Wwwision\TypesJSONSchema\Types\Schema;

final readonly class Example
{

    public function __construct(
        public EventDefinitions $eventDefinitions,
        public CommandDefinitions $commandDefinitions,
        public Projections $projections,
        public CommandHandlerDefinitions $commandHandlerDefinitions,
        public TestCases $testCases,
    ) {
        $this->validateProjections();
        $this->validateCommandHandlers();
        $this->validateTestCases();
    }

    public function forTestCases(TestCases $testCases): self
    {
        $usedCommandNames = [];
        $usedEventTypes = [];
        $usedProjections = [];
        foreach ($testCases as $testCase) {
            if (!array_key_exists($testCase->whenCommand->type, $usedCommandNames)) {
                $commandHandlerDefinition = $this->commandHandlerDefinitions->getForCommand($testCase->whenCommand->type);
                foreach ($commandHandlerDefinition->decisionModels as $decisionModel) {
                    $usedProjections[$decisionModel->name] = true;
                    foreach ($this->projections->get($decisionModel->name)->handlers->eventTypes() as $eventType) {
                        $usedEventTypes[$eventType] = true;
                    }
                }
                $usedEventTypes[$commandHandlerDefinition->successEvent->type] = true;
            }
            $usedCommandNames[$testCase->whenCommand->type] = true;
            if ($testCase->givenEvents !== null) {
                foreach ($testCase->givenEvents as $givenEvent) {
                    $usedEventTypes[$givenEvent->type] = true;
                }
            }
            if ($testCase->thenExpectedEvent !== null) {
                $usedEventTypes[$testCase->thenExpectedEvent->type] = true;
            }
        }
        return new self(
            $this->eventDefinitions->only(...array_keys($usedEventTypes)),
            $this->commandDefinitions->only(...array_keys($usedCommandNames)),
            $this->projections->only(...array_keys($usedProjections)),
            $this->commandHandlerDefinitions->onlyForCommands(...array_keys($usedCommandNames)),
            $testCases,
        );
    }

    private function validateProjections(): void
    {
        foreach ($this->projections as $projection) {
            foreach ($projection->handlers->eventTypes() as $eventType) {
                Assert::true($this->eventDefinitions->exists($eventType), sprintf('Unknown event type "%s" in projection "%s"', $eventType, $projection->name));
            }
            Assert::isList($projection->tagFilters, sprintf('tagFilters no list in projection "%s"', $projection->name));
            Assert::allString($projection->tagFilters, sprintf('invalid tagFilter value of type %%s in projection "%s"', $projection->name));
        }
    }

    private function validateCommandHandlers(): void
    {
        foreach ($this->commandHandlerDefinitions as $commandHandlerDefinition) {
            Assert::true($this->commandDefinitions->exists($commandHandlerDefinition->commandName), sprintf('Handler for unknown command "%s"', $commandHandlerDefinition->commandName));
            foreach ($commandHandlerDefinition->decisionModels as $decisionModel) {
                Assert::true($this->projections->exists($decisionModel->name), sprintf('Unknown projection reference "%s" in decision model of command handler "%s"', $decisionModel->name, $commandHandlerDefinition->commandName));
            }
            Assert::true($this->eventDefinitions->exists($commandHandlerDefinition->successEvent->type), sprintf('Unknown event type "%s" in success event of command handler "%s"', $commandHandlerDefinition->successEvent->type, $commandHandlerDefinition->commandName));
            $successEventDefinition = $this->eventDefinitions->get($commandHandlerDefinition->successEvent->type);
            self::validatePayload($successEventDefinition->schema, $commandHandlerDefinition->successEvent->data, sprintf(' in command handler "%s"', $commandHandlerDefinition->commandName));
        }
    }

    private function validateTestCases(): void
    {
        foreach ($this->testCases as $testCase) {
            if ($testCase->givenEvents !== null) {
                foreach ($testCase->givenEvents as $eventIndex => $event) {
                    Assert::true($this->eventDefinitions->exists($event->type), sprintf('Unknown event "%s" in given.events #%d of test case "%s"', $event->type, $eventIndex, $testCase->description));
                    $eventDefinition = $this->eventDefinitions->get($event->type);
                    self::validatePayload($eventDefinition->schema, $event->data, sprintf(' in given.events #%d (type "%s") of test case "%s"', $eventIndex, $event->type, $testCase->description));
                }
            }
            Assert::true($this->commandDefinitions->exists($testCase->whenCommand->type), sprintf('Unknown when.command "%s" in test case "%s"', $testCase->whenCommand->type, $testCase->description));
            $commandDefinition = $this->commandDefinitions->get($testCase->whenCommand->type);
            self::validatePayload($commandDefinition->schema, $testCase->whenCommand->data, sprintf(' in when.command "%s" of test case "%s"', $testCase->whenCommand->type, $testCase->description));
        }
    }

    /**
     * @param array<string, mixed> $properties
     */
    private static function validatePayload(Schema $schema, array $properties, string $errorSuffix = ''): void
    {

        // TODO implement
        return;
        // Check for missing required command properties
        foreach ($propertyDefinitions as $propertyDefinition) {
            if ($propertyDefinition->required) {
                Assert::keyExists($properties, $propertyDefinition->name, sprintf('Missing required property "%s"', $propertyDefinition->name) . $errorSuffix);
            }
        }
        // Check for additional command parameters and type
        foreach ($properties as $propertyName => $propertyValue) {
            Assert::true($propertyDefinitions->exists($propertyName), sprintf('Unknown property "%s"', $propertyName) . $errorSuffix);
            $propertyDefinition = $propertyDefinitions->get($propertyName);
            // skip templated strings because we can't determine the type of those
            if (is_string($propertyValue) && TemplateString::parse($propertyValue)->getTokens() !== []) {
                continue;
            }
            Assert::same(gettype($propertyValue), $propertyDefinition->type, sprintf('Expected a value identical to %%2$s. Got: %%s for key "%s"', $propertyName) . $errorSuffix);
        }
    }

    public function withProjection(Projection $projection): self
    {
        return new self(
            $this->eventDefinitions,
            $this->commandDefinitions,
            $this->projections->with($projection),
            $this->commandHandlerDefinitions,
            $this->testCases,
        );
    }

    public function withCommandDefinition(CommandDefinition $commandDefinition): self
    {
        return new self(
            $this->eventDefinitions,
            $this->commandDefinitions->with($commandDefinition),
            $this->projections,
            $this->commandHandlerDefinitions,
            $this->testCases,
        );
    }

    public function withCommandHandlerDefinition(CommandHandlerDefinition $commandHandlerDefinition): self
    {
        return new self(
            $this->eventDefinitions,
            $this->commandDefinitions,
            $this->projections,
            $this->commandHandlerDefinitions->with($commandHandlerDefinition),
            $this->testCases,
        );
    }
}
