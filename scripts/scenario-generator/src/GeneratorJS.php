<?php

declare(strict_types=1);

namespace Wwwision\DcbExampleGenerator;

use Wwwision\DcbExampleGenerator\fixture\Event;
use Wwwision\DcbExampleGenerator\projection\Projection;
use Wwwision\DcbExampleGenerator\shared\TemplateString;

use Wwwision\TypesJSONSchema\Types\ObjectSchema;

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
            '// decision models:' . self::lb() . self::lb() .
            $this->decisionModels() . self::lb() .
            '// command handlers:' . self::lb() . self::lb() .
            $this->commandHandlers() . self::lb() .
            '// test cases:' . self::lb() . self::lb() .
            $this->testCases()
        ;
    }

    private function eventTypeDefinitions(): string
    {
        $result = 'const eventTypes = {' . self::lb();
        foreach ($this->example->eventDefinitions as $eventTypeDefinition) {
            $result .= '  "' . $eventTypeDefinition->name . '": {' . self::lb();
            $result .= '    tagResolver: ' . '(data) => ' . '[' . implode(', ', array_map(fn (string $string) => TemplateString::parse($string)->toJsTemplateString(), $eventTypeDefinition->tagResolvers)) . ']' . self::lb();
            $result .= '  },' . self::lb();
        }
        $result .= '}' . self::lb();
        return $result;
    }

    private function decisionModels(): string
    {
        $result = 'const decisionModels = {' . self::lb();
        foreach ($this->example->projections as $projection) {
            $parameterSchema = $projection->parameterSchema;
            $result .= '  "' . $projection->name . '": (' . ($parameterSchema instanceof ObjectSchema ? implode(', ', $parameterSchema->properties?->names() ?? []) : 'value') . ') => ({' . self::lb();
            $result .= '    initialState: ' . json_encode($projection->stateSchema?->default, JSON_THROW_ON_ERROR) . ',' . self::lb();
            $result .= '    handlers: {' . self::lb();
            foreach ($projection->handlers as $eventType => $projectionHandler) {
                $result .= '      ' . $eventType . ': (state, event) => ' . $projectionHandler->value . ',' . self::lb();
            }
            $result .= '    },' . self::lb();
            if ($projection->tagFilters !== null) {
                $result .= '    tagFilter: ' . $this->extractTagFiltersFromProjection($projection) . ',' . self::lb();
            }
            $result .= '  }),' . self::lb();
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

    private function commandHandlers(): string
    {
        $result = 'const commandHandlers = {' . self::lb();
        foreach ($this->example->commandHandlerDefinitions as $commandHandlerDefinition) {
            $result .= '  "' . $commandHandlerDefinition->commandName . '": (command) => {' . self::lb();
            $result .= '    const { state, appendCondition } = buildDecisionModel({' . self::lb();
            foreach ($commandHandlerDefinition->decisionModels as $decisionModel) {
                $result .= '      ' . $decisionModel->name . ': decisionModels.' . $decisionModel->name . '(' . implode(', ', $decisionModel->parameters) . '),' . self::lb();
            }
            $result .= '    })' . self::lb();
            foreach ($commandHandlerDefinition->constraintChecks as $constraintCheck) {
                $result .= '    if (' . $constraintCheck->condition . ') {' . self::lb();
                $result .= '      throw new Error(' . TemplateString::parse($constraintCheck->errorMessage)->toJsTemplateString() . ')' . self::lb();
                $result .= '    }' . self::lb();
            }
            $result .= '    appendEvent(' . self::lb();
            $result .= '      {' . self::lb();
            $result .= '        type: ' . TemplateString::parse($commandHandlerDefinition->successEvent->type)->toJsTemplateString() . ',' . self::lb();
            $result .= '        data: ' . self::jsTemplateStrings($commandHandlerDefinition->successEvent->data) . ',' . self::lb();
            $result .= '      },' . self::lb();
            $result .= '      appendCondition' . self::lb();
            $result .= '    )' . self::lb();
            $result .= '  },' . self::lb() . self::lb();
        }
        $result .= '}' . self::lb();
        return $result;
    }

    private function testCases(): string
    {
        $result = 'test([' . self::lb();
        foreach ($this->example->testCases as $testCase) {
            $result .= '  {' . self::lb();
            $result .= '    description: ' . json_encode($testCase->description) . ',' . self::lb();
            if ($testCase->givenEvents !== null) {
                $result .= '    given: {' . self::lb();
                $result .= '      events: [' . self::lb();
                foreach ($testCase->givenEvents as $event) {
                    $result .= '        {' . self::lb();
                    $result .= '          type: "' . $event->type . '",' . self::lb();
                    $result .= '          data: ' . json_encode($event->data) . ',' . self::lb();
                    if ($event->metadata !== []) {
                        $result .= '          metadata: ' . json_encode($event->metadata) . ',' . self::lb();
                    }
                    $result .= '        },' . self::lb();
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
                $result .= '      expectedEvent: {' . self::lb();
                $result .= '        type: "' . $testCase->thenExpectedEvent->type . '",' . self::lb();
                $result .= '        data: ' . json_encode($testCase->thenExpectedEvent->data) . ',' . self::lb();
                if ($testCase->thenExpectedEvent->metadata !== []) {
                    $result .= '        metadata: ' . json_encode($testCase->thenExpectedEvent->metadata) . ',' . self::lb();
                }
                $result .= '      }' . self::lb();
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

    private function testCaseCommandParameters(array $commandPayload): string
    {
        $params = [];
        foreach ($commandPayload as $parameterName => $parameterValue) {
            $params[] = $parameterName . ': ' . json_encode($parameterValue);
        }
        return '{ ' . implode(', ', $params) . '}';
    }

    private static function jsTemplateStrings(array $strings): string
    {
        $parts = [];
        foreach ($strings as $key => $value) {
            $parts[] = $key . ': ' . TemplateString::parse($value)->toJsTemplateString();
        }
        return '{' . implode(', ', $parts) . '}';
    }

}
