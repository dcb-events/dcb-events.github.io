package events;

import java.util.Optional;

public interface ReadingOptions {

    SequencePosition from();

    boolean backwards();

    Optional<Integer> limit();
}
