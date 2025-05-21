package events;

public interface AppendCondition {

    Query query();

    SequencePosition safePoint();
}
