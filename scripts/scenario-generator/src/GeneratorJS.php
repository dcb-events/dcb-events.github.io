<?php

declare(strict_types=1);

namespace Wwwision\DcbExampleGenerator;

use RuntimeException;
use Wwwision\DcbExampleGenerator\eventDefinition\EventDefinition;
use Wwwision\DcbExampleGenerator\fixture\Event;
use Wwwision\DcbExampleGenerator\projection\Projection;
use Wwwision\DcbExampleGenerator\shared\TemplateString;

use Wwwision\Types\Schema\OneOfSchema;
use Wwwision\TypesJSONSchema\Types\AllOfSchema;
use Wwwision\TypesJSONSchema\Types\AnyOfSchema;
use Wwwision\TypesJSONSchema\Types\ArraySchema;
use Wwwision\TypesJSONSchema\Types\BooleanSchema;
use Wwwision\TypesJSONSchema\Types\IntegerSchema;
use Wwwision\TypesJSONSchema\Types\NotSchema;
use Wwwision\TypesJSONSchema\Types\NullSchema;
use Wwwision\TypesJSONSchema\Types\NumberSchema;
use Wwwision\TypesJSONSchema\Types\ObjectSchema;

use Wwwision\TypesJSONSchema\Types\ReferenceSchema;
use Wwwision\TypesJSONSchema\Types\Schema;
use Wwwision\TypesJSONSchema\Types\StringSchema;

use function Wwwision\Types\instantiate;

final readonly class GeneratorJS
{
    public function __construct(
        private Example $example,
    ) {}

    public function generate(): string
    {
        return
            '// event type definitions:' . self::lb() . self::lb() .
            $this->eventTypeDefinitions() . self::lb() .
            '// projections for decision models:' . self::lb() . self::lb() .
            $this->projections() . self::lb() .
            '// command handlers:' . self::lb() . self::lb() .
            $this->api() . self::lb() .
            '// test cases:' . self::lb() . self::lb() .
            $this->testCases()
        ;
    }

    private function eventTypeDefinitions(): string
    {
        $result = '';
        foreach ($this->example->eventDefinitions as $eventTypeDefinition) {
            $result .= 'class ' . $eventTypeDefinition->name . ' {' . self::lb();
            $result .= '  type = "' . $eventTypeDefinition->name . '"' . self::lb();
            $result .= '  data' . self::lb();
            $result .= '  tags' . self::lb();
            $tags = [];
            foreach ($eventTypeDefinition->tagResolvers as $tagResolver) {
                $tags[] = TemplateString::parse(str_replace('data.', '', $tagResolver))->toJsTemplateString();
            }
            $result .= '  constructor(' . self::schemaToTypeDefinition($eventTypeDefinition->schema) . ') {' . self::lb();
            $result .= '    this.data = ' . self::schemaToTypeDefinition($eventTypeDefinition->schema) . self::lb();
            $result .= '    this.tags = [' . implode(', ', $tags) . ']' . self::lb();
            $result .= '  }' . self::lb();
            $result .= '}' . self::lb() . self::lb();
        }
        return $result;
    }

    private function projections(): string
    {
        $result = '';
        foreach ($this->example->projections as $projection) {
            $parameterSchema = $projection->parameterSchema;
            $result .= 'class ' . ucfirst($projection->name) . 'Projection' . ' {' . self::lb();
            $result .= '  static for(' . ($parameterSchema instanceof ObjectSchema ? implode(', ', $parameterSchema->properties?->names() ?? []) : 'value') . ') {' . self::lb();
            $result .= '    return createProjection({' . self::lb();
            $result .= '      initialState: ' . json_encode($projection->stateSchema?->default, JSON_THROW_ON_ERROR) . ',' . self::lb();
            $result .= '      handlers: {' . self::lb();
            foreach ($projection->handlers as $eventType => $projectionHandler) {
                $result .= '        ' . $eventType . ': (state, event) => ' . $projectionHandler->value . ',' . self::lb();
            }
            $result .= '      },' . self::lb();
            if ($projection->tagFilters !== null) {
                $result .= '      tags: ' . $this->extractTagFiltersFromProjection($projection) . ',' . self::lb();
            }
            $result .= '    })' . self::lb();
            $result .= '  }' . self::lb();
            $result .= '}' . self::lb() . self::lb();
        }
        return $result;
    }



    private function api(): string
    {
        $result = 'class Api {' . self::lb();
        $result .= '  eventStore' . self::lb();
        $result .= '  constructor(eventStore) {' . self::lb();
        $result .= '    this.eventStore = eventStore' . self::lb();
        $result .= '  }' . self::lb() . self::lb();

        foreach ($this->example->commandHandlerDefinitions as $commandHandlerDefinition) {
            $result .= '  ' . $commandHandlerDefinition->commandName . '(command) {' . self::lb();
            $result .= '    const { state, appendCondition } = buildDecisionModel(this.eventStore, {' . self::lb();
            foreach ($commandHandlerDefinition->decisionModels as $decisionModel) {
                $result .= '      ' . $decisionModel->name . ': ' . ucfirst($decisionModel->name) . 'Projection.for(' . implode(', ', $decisionModel->parameters) . '),' . self::lb();
            }
            $result .= '    })' . self::lb();
            foreach ($commandHandlerDefinition->constraintChecks as $constraintCheck) {
                $result .= '    if (' . $constraintCheck->condition . ') {' . self::lb();
                $result .= '      throw new Error(' . TemplateString::parse($constraintCheck->errorMessage)->toJsTemplateString() . ')' . self::lb();
                $result .= '    }' . self::lb();
            }
            $result .= '    this.eventStore.append(' . self::lb();
            $result .= '      new ' . $commandHandlerDefinition->successEvent->type . '({' . self::lb();
            $parts = [];
            foreach ($commandHandlerDefinition->successEvent->data as $key => $value) {
                $parts[] = '        ' . $key . ': ' . TemplateString::parse($value)->toJsTemplateString();
            }
            $result .= implode(',' . self::lb(), $parts) . self::lb();
            $result .= '      }),' . self::lb();
            $result .= '      appendCondition' . self::lb();
            $result .= '    )' . self::lb();
            $result .= '  }' . self::lb() . self::lb();
        }
        $result .= '}' . self::lb();
        return $result;
    }

    private function extractTagFiltersFromProjection(Projection $projection): string
    {
        $tagFilters = [];
        foreach ($projection->tagFilters as $tagFilter) {
            $tagFilters[] = TemplateString::parse($tagFilter)->toJsTemplateString();
        }
        return '[' . implode(', ', $tagFilters) . ']';
    }

    private function testCases(): string
    {
        $result = 'const eventStore = new InMemoryDcbEventStore()' . self::lb();
        $result .= 'const api = new Api(eventStore)' . self::lb();
        $result .= 'runTests(api, eventStore, [' . self::lb();
        foreach ($this->example->testCases as $testCase) {
            $result .= '  {' . self::lb();
            $result .= '    description: ' . json_encode($testCase->description) . ',' . self::lb();
            if ($testCase->givenEvents !== null) {
                $result .= '    given: {' . self::lb();
                $result .= '      events: [' . self::lb();
                foreach ($testCase->givenEvents as $event) {
                    $result .= '        new ' . $event->type . '(';
                    $result .= json_encode($event->data);
                    $result .= '),' . self::lb();
                }
                $result .= '      ],' . self::lb();
                $result .= '    },' . self::lb();
            }
            $result .= '    when: {' . self::lb();
            $result .= '      command: {' . self::lb();
            $result .= '        type: "' . $testCase->whenCommand->type . '",' . self::lb();
            $result .= '        data: ' . json_encode($testCase->whenCommand->data) . ',' . self::lb();
            $result .= '      }' . self::lb();
            $result .= '    },' . self::lb();
            $result .= '    then: {' . self::lb();
            if ($testCase->thenExpectedError !== null) {
                $result .= '      expectedError: ' . json_encode($testCase->thenExpectedError) . ',' . self::lb();
            } else {
                $result .= '      expectedEvent: new ' . $testCase->thenExpectedEvent->type . '(' . json_encode($testCase->thenExpectedEvent->data) . '),' . self::lb();
            }
            $result .= '    }' . self::lb();
            $result .= '  }, ';
        }
        $result .= self::lb() . '])' . self::lb();
        return $result;
    }

    private static function lb(): string
    {
        return chr(10);
    }

    private static function schemaToTypeDefinition(Schema $schema): string
    {
        return match ($schema::class) {
            AllOfSchema::class => 'TODO',
            AnyOfSchema::class => 'TODO',
            ArraySchema::class => 'TODO',
            BooleanSchema::class => 'boolean',
            IntegerSchema::class, NumberSchema::class => 'number',
            NotSchema::class => '!' . self::schemaToTypeDefinition($schema->schema),
            NullSchema::class => 'null',
            ObjectSchema::class => self::objectSchemaToTypeDefinition($schema),
            OneOfSchema::class => 'TODO',
            ReferenceSchema::class => 'TODO',
            StringSchema::class => 'string',

            default => throw new RuntimeException(sprintf('Unsupported schema type: %s', $schema::class))
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
