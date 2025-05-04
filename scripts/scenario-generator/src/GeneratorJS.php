<?php

declare(strict_types=1);

namespace Wwwision\DcbExampleGenerator;

use RuntimeException;
use Webmozart\Assert\Assert;
use Wwwision\DcbExampleGenerator\projection\Projection;
use Wwwision\DcbExampleGenerator\shared\TemplateString;
use Wwwision\TypesJSONSchema\Types\AllOfSchema;
use Wwwision\TypesJSONSchema\Types\AnyOfSchema;
use Wwwision\TypesJSONSchema\Types\ArraySchema;
use Wwwision\TypesJSONSchema\Types\BooleanSchema;
use Wwwision\TypesJSONSchema\Types\IntegerSchema;
use Wwwision\TypesJSONSchema\Types\NotSchema;
use Wwwision\TypesJSONSchema\Types\NullSchema;
use Wwwision\TypesJSONSchema\Types\NumberSchema;
use Wwwision\TypesJSONSchema\Types\ObjectSchema;
use Wwwision\TypesJSONSchema\Types\OneOfSchema;
use Wwwision\TypesJSONSchema\Types\ReferenceSchema;
use Wwwision\TypesJSONSchema\Types\Schema;
use Wwwision\TypesJSONSchema\Types\StringSchema;

final class GeneratorJS
{
    private Output $output;

    public function __construct(
        private Example $example,
        private MergeResult|null $mergeResult,
    ) {}

    public function generate(): Output
    {
        $this->output = new Output();
        $this->eventTypeDefinitions();
        $this->projections();
        $this->api();
        $this->testCases();
        return $this->output;
    }

    private function eventTypeDefinitions(): void
    {
        $this->output->addLine('// event type definitions:');
        $this->output->addLine();
        foreach ($this->example->eventDefinitions as $eventTypeDefinition) {
            if ($this->mergeResult?->isNewEventDefinition($eventTypeDefinition)) {
                $this->output->startHighlighting();
            }
            $this->output->addLine('function ' . $eventTypeDefinition->name . '(' . self::schemaToTypeDefinition($eventTypeDefinition->schema) . ') {');
            $this->output->addLine('  return {');
            $this->output->addLine('    type: "' . $eventTypeDefinition->name . '",');
            $this->output->addLine('    data: ' . self::schemaToTypeDefinition($eventTypeDefinition->schema) . ',');
            $tags = [];
            foreach ($eventTypeDefinition->tagResolvers as $tagResolver) {
                $tags[] = TemplateString::parse(str_replace('data.', '', $tagResolver))->toJsTemplateString();
            }
            $this->output->addLine('    tags: [' . implode(', ', $tags) . '],');
            $this->output->addLine('  }');
            $this->output->addLine('}');
            $this->output->endHighlighting();
            $this->output->addLine();
        }
    }

    private function projections(): void
    {
        $this->output->addLine('// projections for decision models:');
        $this->output->addLine();
        foreach ($this->example->projections as $projection) {
            if ($this->mergeResult?->isNewProjection($projection)) {
                $this->output->startHighlighting();
            }
            $parameterSchema = $projection->parameterSchema;
            $this->output->addLine('function ' . ucfirst($projection->name) . 'Projection(' . ($parameterSchema instanceof ObjectSchema ? implode(', ', $parameterSchema->properties?->names() ?? []) : 'value') . ') {');
            $this->output->addLine('  return createProjection({');
            $this->output->addLine('    initialState: ' . json_encode($projection->stateSchema->default ?? null, JSON_THROW_ON_ERROR) . ',');
            $this->output->addLine('    handlers: {');
            foreach ($projection->handlers as $eventType => $projectionHandler) {
                $this->output->addLine('      ' . $eventType . ': (state, event) => ' . $projectionHandler->value . ',');
            }
            $this->output->addLine('    },');
            if ($projection->tagFilters !== null) {
                $this->output->addLine('    tagFilter: ' . $this->extractTagFiltersFromProjection($projection) . ',');
            }
            $this->output->addLine('  })');
            $this->output->addLine('}');
            $this->output->endHighlighting();
            $this->output->addLine();
        }
    }



    private function api(): void
    {
        $this->output->addLine('// command handlers:');
        $this->output->addLine();
        $this->output->addLine('class Api {');
        $this->output->addLine('  eventStore');
        $this->output->addLine('  constructor(eventStore) {');
        $this->output->addLine('    this.eventStore = eventStore');
        $this->output->addLine('  }');

        foreach ($this->example->commandHandlerDefinitions as $commandHandlerDefinition) {
            $this->output->addLine();
            if ($this->mergeResult?->isNewCommandHandlerDefinition($commandHandlerDefinition)) {
                $this->output->startHighlighting();
            }
            $this->output->addLine('  ' . $commandHandlerDefinition->commandName . '(command) {');
            $this->output->addLine('    const { state, appendCondition } = buildDecisionModel(this.eventStore, {');
            foreach ($commandHandlerDefinition->decisionModels as $decisionModel) {
                $this->output->addLine('      ' . $decisionModel->name . ': ' . ucfirst($decisionModel->name) . 'Projection(' . implode(', ', $decisionModel->parameters) . '),');
            }
            $this->output->addLine('    })');
            foreach ($commandHandlerDefinition->constraintChecks as $constraintCheck) {
                $this->output->addLine('    if (' . $constraintCheck->condition . ') {');
                $this->output->addLine('      throw new Error(' . TemplateString::parse($constraintCheck->errorMessage)->toJsTemplateString() . ')');
                $this->output->addLine('    }');
            }
            $this->output->addLine('    this.eventStore.append(');
            $this->output->addLine('      ' . $commandHandlerDefinition->successEvent->type . '({');
            foreach ($commandHandlerDefinition->successEvent->data as $key => $value) {
                $this->output->addLine('        ' . $key . ': ' . TemplateString::parse($value)->toJsTemplateString() . ',');
            }
            $this->output->addLine('      }),');
            $this->output->addLine('      appendCondition');
            $this->output->addLine('    )');
            $this->output->addLine('  }');
            $this->output->endHighlighting();
        }
        $this->output->addLine('}');
        $this->output->addLine();
    }

    private function extractTagFiltersFromProjection(Projection $projection): string
    {
        if ($projection->tagFilters === null) {
            return '[]';
        }
        $tagFilters = [];
        foreach ($projection->tagFilters as $tagFilter) {
            $tagFilters[] = TemplateString::parse($tagFilter)->toJsTemplateString();
        }
        return '[' . implode(', ', $tagFilters) . ']';
    }

    private function testCases(): void
    {
        $this->output->addLine('// test cases:');
        $this->output->addLine();
        $this->output->addLine('const eventStore = new InMemoryDcbEventStore()');
        $this->output->addLine('const api = new Api(eventStore)');
        $this->output->addLine('runTests(api, eventStore, [');
        foreach ($this->example->testCases as $testCase) {
            if ($this->mergeResult?->isNewTestCase($testCase)) {
                $this->output->startHighlighting();
            }
            $this->output->addLine('  {');
            $this->output->addLine('    description: ' . json_encode($testCase->description) . ',');
            if ($testCase->givenEvents !== null) {
                $this->output->addLine('    given: {');
                $this->output->addLine('      events: [');
                foreach ($testCase->givenEvents as $event) {
                    $eventDefinition = $event->type . '(' . json_encode($event->data) . ')';
                    if ($event->metadata !== []) {
                        $eventDefinition = 'addEventMetadata(' . $eventDefinition . ', ' . json_encode($event->metadata) . ')';
                    }
                    $this->output->addLine('        ' . $eventDefinition . ',');
                }
                $this->output->addLine('      ],');
                $this->output->addLine('    },');
            }
            $this->output->addLine('    when: {');
            $this->output->addLine('      command: {');
            $this->output->addLine('        type: "' . $testCase->whenCommand->type . '",');
            $this->output->addLine('        data: ' . json_encode($testCase->whenCommand->data) . ',');
            $this->output->addLine('      }');
            $this->output->addLine('    },');
            $this->output->addLine('    then: {');
            if ($testCase->thenExpectedError !== null) {
                $this->output->addLine('      expectedError: ' . json_encode($testCase->thenExpectedError) . ',');
            } else {
                Assert::notNull($testCase->thenExpectedEvent, 'Expected event must be set if no expected error is set');
                $this->output->addLine('      expectedEvent: ' . $testCase->thenExpectedEvent->type . '(' . json_encode($testCase->thenExpectedEvent->data) . '),');
            }
            $this->output->addLine('    }');
            $this->output->addLine('  }, ');
            $this->output->endHighlighting();
        }
        $this->output->addLine('])');
    }

    private static function schemaToTypeDefinition(Schema $schema): string
    {
        return match ($schema::class) {
            AllOfSchema::class, OneOfSchema::class, ReferenceSchema::class, ArraySchema::class, AnyOfSchema::class => 'TODO',
            BooleanSchema::class => 'boolean',
            IntegerSchema::class, NumberSchema::class => 'number',
            NotSchema::class => '!' . self::schemaToTypeDefinition($schema->schema),
            NullSchema::class => 'null',
            ObjectSchema::class => self::objectSchemaToTypeDefinition($schema),
            StringSchema::class => 'string',

            default => throw new RuntimeException(sprintf('Unsupported schema type: %s', $schema::class)),
        };
    }

    private static function objectSchemaToTypeDefinition(ObjectSchema $schema): string
    {
        $parts = [];
        foreach ($schema->properties ?? [] as $propertyName => $propertySchema) {
            $parts[] = $propertyName;
        }
        return '{ ' . implode(', ', $parts) . ' }';
    }

}
