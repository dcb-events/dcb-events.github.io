<?php

declare(strict_types=1);

namespace Wwwision\DcbExampleGenerator\testCase;

use Webmozart\Assert\Assert;
use Wwwision\DcbExampleGenerator\fixture\Event;
use Wwwision\DcbExampleGenerator\fixture\Events;

final readonly class TestCase
{
    public function __construct(
        public string $description,
        public Events|null $givenEvents,
        public Command $whenCommand,
        public Event|null $thenExpectedEvent = null,
        public string|null $thenExpectedError = null,
    ) {
        if ($this->thenExpectedEvent !== null) {
            Assert::null($this->thenExpectedError, 'Expected event and error are mutually exclusive');
        } elseif ($this->thenExpectedError !== null) {
            Assert::null($this->thenExpectedEvent, 'Expected event and error are mutually exclusive');
        } else {
            throw new \InvalidArgumentException('Either expected event or error must be set');
        }
    }
}
