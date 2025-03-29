<?php

declare(strict_types=1);

namespace Wwwision\DcbExampleGenerator\commandHandlerDefinition;

final readonly class DecisionModel
{
    /**
     * @param string $name refers to the corresponding {@see Projection::$name}
     * @param array<string> $parameters array in the form ['hard-coded', ...] (e.g. ['command.courseId'])
     */
    public function __construct(
        public string $name,
        public array $parameters,
    ) {}
}
