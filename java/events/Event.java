package events;

public interface Event {

    String type();

    String[] tags();

    byte[] payload();
}
