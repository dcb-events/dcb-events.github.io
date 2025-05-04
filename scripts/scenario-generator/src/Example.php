<?php

declare(strict_types=1);

namespace Wwwision\DcbExampleGenerator;

use Webmozart\Assert\Assert;
use Wwwision\DcbExampleGenerator\commandDefinition\CommandDefinitions;
use Wwwision\DcbExampleGenerator\commandHandlerDefinition\CommandHandlerDefinitions;
use Wwwision\DcbExampleGenerator\eventDefinition\EventDefinitions;
use Wwwision\DcbExampleGenerator\projection\Projections;
use Wwwision\DcbExampleGenerator\shared\TemplateString;
use Wwwision\DcbExampleGenerator\testCase\TestCases;
use Wwwision\TypesJSONSchema\Types\Schema;

final readonly class Example
{
    public Meta $meta;
    public EventDefinitions $eventDefinitions;
    public CommandDefinitions $commandDefinitions;
    public Projections $projections;
    public CommandHandlerDefinitions $commandHandlerDefinitions;
    public TestCases $testCases;

    public function __construct(
        Meta|null $meta = null,
        EventDefinitions|null $eventDefinitions = null,
        CommandDefinitions|null $commandDefinitions = null,
        Projections|null $projections = null,
        CommandHandlerDefinitions|null $commandHandlerDefinitions = null,
        TestCases|null $testCases = null,
    ) {
        $this->meta = $meta ?? new Meta(version: '1.0');
        $this->eventDefinitions = $eventDefinitions ?? EventDefinitions::none();
        $this->commandDefinitions = $commandDefinitions ?? CommandDefinitions::none();
        $this->projections = $projections ?? Projections::none();
        $this->commandHandlerDefinitions = $commandHandlerDefinitions ?? CommandHandlerDefinitions::none();
        $this->testCases = $testCases ?? TestCases::none();
    }

    public function merge(self $other): MergeResult
    {
        $mergedExample = new self(
            meta: $this->meta->merge($other->meta),
            eventDefinitions: $this->eventDefinitions->merge($other->eventDefinitions),
            commandDefinitions: $this->commandDefinitions->merge($other->commandDefinitions),
            projections: $this->projections->merge($other->projections),
            commandHandlerDefinitions: $this->commandHandlerDefinitions->merge($other->commandHandlerDefinitions),
            testCases: $this->testCases->merge($other->testCases),
        );

        return new MergeResult(
            mergedExample: $mergedExample,
            newEventDefinitionNames: $other->eventDefinitions->names(),
            newCommandDefinitionNames: $other->commandDefinitions->names(),
            newProjectionNames: $other->projections->names(),
            newCommandHandlerDefinitionCommandNames: $other->commandHandlerDefinitions->commandNames(),
            newTestCaseDescriptions: $other->testCases->descriptions(),
        );
    }

    public function validate(): void
    {
        $this->validateProjections();
        $this->validateCommandHandlers();
        $this->validateTestCases();
    }

    private function validateProjections(): void
    {
        foreach ($this->projections as $projection) {
            foreach ($projection->handlers->eventTypes() as $eventType) {
                Assert::true($this->eventDefinitions->exists($eventType), sprintf('Unknown event type "%s" in projection "%s"', $eventType, $projection->name));
            }
            if ($projection->tagFilters !== null) {
                Assert::isList($projection->tagFilters, sprintf('tagFilters no list in projection "%s"', $projection->name));
                Assert::allString($projection->tagFilters, sprintf('invalid tagFilter value of type %%s in projection "%s"', $projection->name));
            }
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
                    Assert::numeric($eventIndex);
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
        // TODO re-implement
        //        // Check for missing required command properties
        //        foreach ($propertyDefinitions as $propertyDefinition) {
        //            if ($propertyDefinition->required) {
        //                Assert::keyExists($properties, $propertyDefinition->name, sprintf('Missing required property "%s"', $propertyDefinition->name) . $errorSuffix);
        //            }
        //        }
        //        // Check for additional command parameters and type
        //        foreach ($properties as $propertyName => $propertyValue) {
        //            Assert::true($propertyDefinitions->exists($propertyName), sprintf('Unknown property "%s"', $propertyName) . $errorSuffix);
        //            $propertyDefinition = $propertyDefinitions->get($propertyName);
        //            // skip templated strings because we can't determine the type of those
        //            if (is_string($propertyValue) && TemplateString::parse($propertyValue)->getTokens() !== []) {
        //                continue;
        //            }
        //            Assert::same(gettype($propertyValue), $propertyDefinition->type, sprintf('Expected a value identical to %%2$s. Got: %%s for key "%s"', $propertyName) . $errorSuffix);
        //        }
    }
}
