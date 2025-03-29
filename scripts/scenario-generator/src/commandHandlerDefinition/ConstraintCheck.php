<?php

declare(strict_types=1);

namespace Wwwision\DcbExampleGenerator\commandHandlerDefinition;

final readonly class ConstraintCheck
{
    public function __construct(
        public string $condition,
        public string $errorMessage,
    ) {}
}
