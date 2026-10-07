<?php

declare(strict_types=1);

namespace Wwwision\DcbExampleGenerator\tests\unit;

use PHPUnit\Framework\Attributes\CoversClass;
use PHPUnit\Framework\TestCase;
use Wwwision\DcbExampleGenerator\Meta;
use Wwwision\DcbExampleGenerator\SourceImplementation;
use Wwwision\DcbExampleGenerator\SourceImplementations;

#[CoversClass(Meta::class)]
#[CoversClass(SourceImplementation::class)]
#[CoversClass(SourceImplementations::class)]
final class SourceImplementationsTest extends TestCase
{
    public function test_metadata_inherits_and_overrides_implementations_by_id(): void
    {
        $base = new Meta(
            version: '1.0',
            id: 'example_01',
            implementations: SourceImplementations::fromArray([
                new SourceImplementation(
                    id: 'factos',
                    label: 'Gleam',
                    language: 'gleam',
                    source: 'libraries/factos/example.gleam',
                    sourceLines: '1:10',
                    projectName: 'factos',
                    projectUrl: 'https://example.com/factos',
                    packageUrl: 'https://example.com/factos/example',
                ),
                new SourceImplementation(
                    id: 'other',
                    label: 'Rust',
                    language: 'rust',
                    source: 'libraries/other/example.rs',
                    projectName: 'other',
                    projectUrl: 'https://example.com/other',
                    packageUrl: 'https://example.com/other/example',
                ),
            ]),
        );
        $extension = new Meta(
            version: '1.0',
            id: 'example_02',
            extends: 'example_01',
            implementations: SourceImplementations::fromArray([
                new SourceImplementation(
                    id: 'factos',
                    sourceLines: '1:20',
                    highlightLines: '11-20',
                ),
            ]),
        );

        $merged = $base->merge($extension);

        self::assertNotNull($merged->implementations);
        $implementations = iterator_to_array($merged->implementations);
        self::assertCount(2, $implementations);
        self::assertSame('factos', $implementations[0]->id);
        self::assertSame('Gleam', $implementations[0]->label);
        self::assertSame('libraries/factos/example.gleam', $implementations[0]->source);
        self::assertSame('1:20', $implementations[0]->sourceLines);
        self::assertSame('11-20', $implementations[0]->highlightLines);
        self::assertSame('other', $implementations[1]->id);
    }
}
