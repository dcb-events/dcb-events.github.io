<?php

declare(strict_types=1);

namespace Wwwision\DcbExampleGenerator\commandHandlerDefinition;

use Wwwision\DcbExampleGenerator\fixture\Event;

final readonly class CommandHandlerDefinition
{
    public function __construct(
        public string $commandName,
        public DecisionModels $decisionModels,
        public ConstraintChecks $constraintChecks,
        public Event $successEvent,
    ) {}

    public function withConstraintChecks(ConstraintChecks $constraintChecks): self
    {
        return new self($this->commandName, $this->decisionModels, $constraintChecks, $this->successEvent);
    }
}
