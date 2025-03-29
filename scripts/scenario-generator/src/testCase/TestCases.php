<?php

declare(strict_types=1);

namespace Wwwision\DcbExampleGenerator\testCase;

use IteratorAggregate;
use Traversable;
use Wwwision\Types\Attributes\ListBased;

use function Wwwision\Types\instantiate;

/**
 * @implements IteratorAggregate<TestCase>
 */
#[ListBased(itemClassName: TestCase::class)]
final readonly class TestCases implements IteratorAggregate
{
    /**
     * @param array<TestCase> $testCases
     */
    private function __construct(
        private array $testCases,
    ) {
    }

    /**
     * @param array<TestCase> $testCases
     */
    public static function fromArray(array $testCases): self
    {
        return instantiate(self::class, $testCases);
    }

    public function getIterator(): Traversable
    {
        yield from array_values($this->testCases);
    }
}
